import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try{
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        console.log("Paramters:", parameters)
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;

        if (!movieId){
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ Message: "Missing movie Id" }),
            };
        }

        const commandOutput = await ddbDocClient.send(      //Query command used -> get collection of items rather than single
            new QueryCommand({                              //https://www.tecracer.com/blog/2021/03/dynamodb-in-15-minutes.html
                TableName: process.env.TABLE_NAME,      
                KeyConditionExpression: "MovieId = :m",
                ExpressionAttributeValues: {
                    ":m": movieId,
                },
            })
        );

        if(!commandOutput.Items || commandOutput.Items.length === 0){       // Query command always returns data even if nothing is found
            return {                                                        // https://stackoverflow.com/questions/44337856/check-if-specific-object-is-empty-in-typescript
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Invalid movie Id, or no reviews have been written for this movie yet" }),
            };
        }

        const body = {
            data: commandOutput.Items
        }

        return{
            statusCode: 200,
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(body),
        };
    } catch (error: any){
        console.log(JSON.stringify(error));
            return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        };
    }
};




function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
      wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
  }