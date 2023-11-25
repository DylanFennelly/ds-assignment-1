import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";

type AuthApiProps = {
    userPoolId: string;
    userPoolClientId: string;
};

export class AuthApi extends Construct {
    private auth: apig.IResource;
    private userPoolId: string;
    private userPoolClientId: string;

    constructor(scope: Construct, id: string, props: AuthApiProps) {
        super(scope, id);

        ({ userPoolId: this.userPoolId, userPoolClientId: this.userPoolClientId } =
            props);

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