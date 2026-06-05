export interface AuthAnswer
{
    id : number;
    token: string;
    responseCode: number | null;
    fullName?: string | null;
    position?: string | null;
}
