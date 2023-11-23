import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { reviews } from '../seed/reviews';
import * as apig from "aws-cdk-lib/aws-apigateway";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";

import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class DsAssignment1Stack extends cdk.Stack {
  private auth: apig.IResource;
  private userPoolId: string;
  private userPoolClientId: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ############
    // ### AUTH ###
    // ############

    //User pool
    const userPool = new UserPool(this, "Assign1UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("Assign1AppClient", {
      authFlows: { userPassword: true },
    });

    this.userPoolClientId = appClient.userPoolClientId;

    const authApi = new apig.RestApi(this, "Assign1AuthServiceApi", {
      description: "Authentication Service RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    //Auth API
    this.auth = authApi.root.addResource("auth");

    //signup
    this.addAuthRoute(
      "signup",
      "POST",
      "SignupFn",
      'signup.ts'
    );

    //confirm signup
    this.addAuthRoute(
      "confirm_signup",
      "POST",
      "ConfirmFn",
      "confirm-signup.ts"
    );

    //signout
    this.addAuthRoute('signout', 'GET', 'SignoutFn', 'signout.ts');

    //signin
    this.addAuthRoute('signin', 'POST', 'SigninFn', 'signin.ts');


    // #####################
    // ### DYNAMODB INIT ###
    // #####################

    //DynamoDB table
    const reviewsTable = new dynamodb.Table(this, "reviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "MovieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "ReviewDate", type: dynamodb.AttributeType.STRING },     // Adds a sort key to create a composite key
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
    const newReviewFn = new lambdanode.NodejsFunction(this, "AddMovieFn", {
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

    //table permissions
    reviewsTable.grantReadData(getMovieReviewsFn)
    reviewsTable.grantReadWriteData(newReviewFn)
    reviewsTable.grantReadData(getMovieReviewsByAuthorFn)

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
      new apig.LambdaIntegration(newReviewFn, { proxy: true })
    )


    //specific movie
    const movieIdEndpoint = moviesEndpoint.addResource("{movieId}");

    //speicifc movie reviews
    const movieReviewsEndpoint = movieIdEndpoint.addResource("reviews");
    movieReviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true })
    )

    //specific move reviews by reviewer
    const movieReviewsByAuthorEndpoint = movieReviewsEndpoint.addResource("{reviewerName}");
    movieReviewsByAuthorEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewsByAuthorFn, { proxy: true })
    )

  }

  private addAuthRoute(   //private method to reduce code duplicate
    resourceName: string,
    method: string,
    fnName: string,
    fnEntry: string,
    allowCognitoAccess?: boolean
  ): void {
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        REGION: cdk.Aws.REGION
      },
    };
    
    const resource = this.auth.addResource(resourceName);
    
    const fn = new node.NodejsFunction(this, fnName, {
      ...commonFnProps,
      entry: `${__dirname}/../lambda/auth/${fnEntry}`,
    });

    resource.addMethod(method, new apig.LambdaIntegration(fn));
  }  // end private method
}
