import { stringList } from "aws-sdk/clients/datapipeline";

export type Review = {
    MovieId: number;
    ReviewerName: string;
    ReviewDate: string;
    Content: string;
}