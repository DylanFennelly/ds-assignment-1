import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommandInput, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ddbDocClient = createDDbDocClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        console.log("Paramters:", parameters)
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const reviewerName = parameters?.reviewerName ? parameters.reviewerName : undefined;
        const translateCode = event?.queryStringParameters?.language;

        if (!movieId && !reviewerName && !translateCode) {
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "Missing movie Id, ReviewerName, or translation code" }),
            };
        }

        const commandOutput = await ddbDocClient.send(
            new QueryCommand({
                TableName: process.env.TABLE_NAME,
                KeyConditionExpression: "MovieId = :m AND ReviewerName = :rN",
                ExpressionAttributeValues: {
                    ":m": movieId,
                    ":rN": reviewerName
                },
            })
        )

        if (!commandOutput.Items || commandOutput.Items.length === 0) {       // Query command always returns data even if nothing is found
            return {                                                        // https://stackoverflow.com/questions/44337856/check-if-specific-object-is-empty-in-typescript
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "No reviews found. Verify movie Id and reviewer name/review year and try again." }),
            };
        }

        const translatedReview = await translateClient.send(        //https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-translate/classes/translatetextcommand.html
            new TranslateTextCommand({
                SourceLanguageCode: "en",
                TargetLanguageCode: translateCode,
                Text: commandOutput.Items[0].Content
            })
        )

        commandOutput.Items[0].Content = translatedReview.TranslatedText

        const body = {
            data: commandOutput.Items
        }

        return {
            statusCode: 200,
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(body),
        };
    } catch (error: any) {
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