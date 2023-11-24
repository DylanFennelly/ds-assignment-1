import { stringList } from "aws-sdk/clients/datapipeline";

export type Review = {
    MovieId: number;
    ReviewerName: string;
    ReviewDate: string;
    Content: string;
    Rating: number;     //number rating from 1-10
}

export type SignUpBody = {
    username: string;
    password: string;
    email: string
  }

export type ConfirmSignUpBody = {
    username: string;
    code: string;
}

export type SignInBody = {
    username: string;
password: string;
}

export type updateReview = {
    ReviewDate: string;
    Content: string;
    Rating: number;     //number rating from 1-10
}