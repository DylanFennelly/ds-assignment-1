import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { reviews } from '../seed/reviews';
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam"

import { Construct } from 'constructs';

type AppApiProps = {
    userPoolId: string;
    userPoolClientId: string;
};

export class AppApi extends Construct {
    private userPoolId: string;
    private userPoolClientId: string;

    constructor(scope: Construct, id: string, props: AppApiProps) {
        super(scope, id);

        ({ userPoolId: this.userPoolId, userPoolClientId: this.userPoolClientId } =
            props);

    // #####################
    // ### DYNAMODB INIT ###
    // #####################

    //DynamoDB table
    const reviewsTable = new dynamodb.Table(this, "reviewsTable", {
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        partitionKey: { name: "MovieId", type: dynamodb.AttributeType.NUMBER },
        sortKey: { name: "ReviewerName", type: dynamodb.AttributeType.STRING },   // Adds a sort key to create a composite key
        removalPolicy: cdk.RemovalPolicy.DESTROY,                                 // (allows a single MovieId to have multiple reviews [one per date])
        tableName: "Reviews",                                                     // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.Table.html
      });
  
      //table seeding
      new custom.AwsCustomResource(this, "reviewsddbInitData", {
        onCreate: {
          service: "DynamoDB",
          action: "batchWriteItem",
          parameters: {
            RequestItems: {
              [reviewsTable.tableName]: generateBatch(reviews)
            },
          },
          physicalResourceId: custom.PhysicalResourceId.of("reviewsddbInitData"),
        },
        policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [reviewsTable.tableArn]
        }),
      });
  
      // #################
      // ### FUNCTIONS ###
      // #################
  
      //get all movies for input movie ID
      const getMovieReviewsFn = new lambdanode.NodejsFunction(
        this,
        "GetMovieReviewsFn",
        {
          architecture: lambda.Architecture.ARM_64,
          runtime: lambda.Runtime.NODEJS_16_X,
          entry: `${__dirname}/../lambda/getMovieReviews.ts`,
          timeout: cdk.Duration.seconds(10),
          memorySize: 128,
          environment: {
            TABLE_NAME: reviewsTable.tableName,
            REGION: 'eu-west-1',
          },
        }
      )
  
      //add new movie review
      const newReviewFn = new lambdanode.NodejsFunction(this, "AddReviewFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/addReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
      });
  
      //get movie reviews by reviewer name
      const getMovieReviewsByAuthorFn = new lambdanode.NodejsFunction(this, "GetMovieReviewsByAuthorFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/getMovieReviewsByAuthor.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
      });
  
      //get all reviews by reviewer name
      const getAllReviewsByAuthorFn = new lambdanode.NodejsFunction(this, "GetAllReviewsByAuthorFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/getAllReviewsByAuthor.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
      });
  
      //update review
      const updateReviewFn = new lambdanode.NodejsFunction(this, "UpdateReviewFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/updateMovieReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
      });

      //IAM permissions for translate review FN to use Translate - https://docs.aws.amazon.com/cdk/v2/guide/permissions.html
      const translatePolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('TranslateFullAccess')     // https://docs.aws.amazon.com/translate/latest/dg/security-iam-awsmanpol.html
      const translateRole = new iam.Role(this, 'TranslateLambdaRole', {         //https://stackoverflow.com/questions/62094746/aws-cdk-role-and-policy-creation
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
      })

      translateRole.addManagedPolicy(translatePolicy)

      //translate review
      const translateReviewFn = new lambdanode.NodejsFunction(this, "TranslateReviewFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/translateReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
        role: translateRole
      });


      
  
      //authorizer
      const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/auth/authorizer.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          USER_POOL_ID: this.userPoolId,
          CLIENT_ID: this.userPoolClientId,
          TABLE_NAME: reviewsTable.tableName,
          REGION: "eu-west-1",
        },
      });
  
      //request authorizer
      const requestAuthorizer = new apig.RequestAuthorizer(
        this,
        "RequestAuthorizer",
        {
          identitySources: [apig.IdentitySource.header("cookie")],
          handler: authorizerFn,
          resultsCacheTtl: cdk.Duration.minutes(0),
        }
      );
  
      //table permissions
      reviewsTable.grantReadData(getMovieReviewsFn)
      reviewsTable.grantReadWriteData(newReviewFn)
      reviewsTable.grantReadData(getMovieReviewsByAuthorFn)
      reviewsTable.grantReadData(getAllReviewsByAuthorFn)
      reviewsTable.grantReadWriteData(updateReviewFn)
      reviewsTable.grantReadData(translateReviewFn)
  
      // #####################
      // ### API ENDPOINTS ###
      // #####################
  
      //REST API
      const api = new apig.RestApi(this, "RestAPI", {
        description: "Assignment 1 API",
        deployOptions: {
          stageName: "dev",
        },
        //CORS
        defaultCorsPreflightOptions: {
          allowHeaders: ["Content-Type", "X-Amz-Date"],
          allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
          allowCredentials: true,
          allowOrigins: ["*"],
        },
      }
      )
  
      //API root - all endpoints branch from this
      const moviesEndpoint = api.root.addResource("movies");
  
      //movie reviews (for post)
      const reviewsEndpoint = moviesEndpoint.addResource("reviews")
      reviewsEndpoint.addMethod(
        "POST",
        new apig.LambdaIntegration(newReviewFn, { proxy: true }),
        {
          authorizer: requestAuthorizer,
          authorizationType: apig.AuthorizationType.CUSTOM,
        }
      )
  
      //all reviews by reviewer
      const getAllReviewsByAuthorEndpoint = reviewsEndpoint.addResource("{reviewerName}")
      getAllReviewsByAuthorEndpoint.addMethod(
        "GET",
        new apig.LambdaIntegration(getAllReviewsByAuthorFn, { proxy: true })
      )
  
  
      //specific movie
      const movieIdEndpoint = moviesEndpoint.addResource("{movieId}");
  
      //speicifc movie reviews
      const movieReviewsEndpoint = movieIdEndpoint.addResource("reviews");
      movieReviewsEndpoint.addMethod(
        "GET",
        new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true })
      )
  
      //specific move reviews by reviewer or year
      const movieReviewsByAuthorEndpoint = movieReviewsEndpoint.addResource("{reviewerName}");
      movieReviewsByAuthorEndpoint.addMethod(
        "GET",
        new apig.LambdaIntegration(getMovieReviewsByAuthorFn, { proxy: true })
      )
  
      movieReviewsByAuthorEndpoint.addMethod(
        "PUT",
        new apig.LambdaIntegration(updateReviewFn, { proxy: true }),
        {
          authorizer: requestAuthorizer,
          authorizationType: apig.AuthorizationType.CUSTOM,
        }
      )

      const translateReviewEndpoint = movieReviewsByAuthorEndpoint.addResource("translate");
      translateReviewEndpoint.addMethod(
        "GET",
        new apig.LambdaIntegration(translateReviewFn, { proxy: true })
      )
    }
}