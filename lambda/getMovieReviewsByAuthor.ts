import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommandInput, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try{
        console.log("Event: ", event);
        const parameters = event?.pathParameters;
        console.log("Paramters:", parameters)
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const inputParam = parameters?.reviewerName ? parameters.reviewerName : undefined;
        let isYear = false                          //boolean flag after regex check to know if inputParam is year or reviewerName
        const yearRegex = new RegExp(/^\d{4}$/)     //regex to check if string complies to format of 4 digits 

        if (!movieId || !inputParam){
            return {
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ Message: "Missing movie Id" }),
            };
        }

        if (yearRegex.test(inputParam)){        //if inputParam matches regex, it is a year - https://stackoverflow.com/questions/16648679/regexp-in-typescript
            isYear = true                       //this is assuming a username comprised of only 4 digits is not allowed
        }

        let commandInput: QueryCommandInput={
            TableName: process.env.TABLE_NAME,
        }

        if (isYear){
            commandInput = {   
                ...commandInput,       
                TableName: process.env.TABLE_NAME,
                KeyConditionExpression: "MovieId = :m and begins_with(ReviewDate, :year)",
                //FilterExpression: "begins_with(ReviewDate, :year)",
                ExpressionAttributeValues: {
                    ":m": movieId,
                    ":year": inputParam
                },
            }
        }else{
             commandInput = {   
                ...commandInput,       
                TableName: process.env.TABLE_NAME,
                KeyConditionExpression: "MovieId = :m",
                FilterExpression: "ReviewerName = :rN",
                ExpressionAttributeValues: {
                    ":m": movieId,
                    ":rN": inputParam
                },
            }
        }

        const commandOutput = await ddbDocClient.send(
            new QueryCommand(commandInput)
        )

        if(!commandOutput.Items || commandOutput.Items.length === 0){       // Query command always returns data even if nothing is found
            return {                                                        // https://stackoverflow.com/questions/44337856/check-if-specific-object-is-empty-in-typescript
                statusCode: 404,
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ Message: "No reviews found. Verify movie Id and reviewer name/review year and try again." }),
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