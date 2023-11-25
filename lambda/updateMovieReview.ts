import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json"

const ajv = new Ajv()
const isValidBodyParams = ajv.compile(schema.definitions["updateReview"] || {});

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try{
        console.log("Event: ", event);
        const body = event.body ? JSON.parse(event.body) : undefined;
        const parameters = event?.pathParameters;
        console.log("Paramters:", parameters)
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;     //MovieID and Reviewer name given through URL params
        const reviewerName = parameters?.reviewerName ? parameters.reviewerName : undefined;

        if (!movieId || !reviewerName){
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ Message: "Missing movie Id or reviewer name" }),
            };
        }

        if (!body){
            return {
                statusCode: 500,
                headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ message: "Missing request body" }),
            }
        }

        if (!isValidBodyParams(body)) {
            return {
              statusCode: 500,
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                message: `Input body does not match Review schema.`,
                schema: schema.definitions["updateReview"],
              }),
            };
          }

        const commandOutput = await ddbDocClient.send(
            new UpdateCommand({                             //https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStarted.UpdateItem.html
                TableName: process.env.TABLE_NAME,
                Key: {
                    MovieId: movieId,
                    ReviewerName: reviewerName,
                },
                UpdateExpression: 'SET Content = :c',
                ExpressionAttributeValues:{
                    ':c': body.Content,
                }
            })
        );

        return {
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Review updated" }),
        }

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