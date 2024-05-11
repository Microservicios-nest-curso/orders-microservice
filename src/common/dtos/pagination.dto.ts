import { Type } from "class-transformer";
import { IsOptional, IsPositive} from "class-validator";

export class PaginationDto {
    @IsPositive()
    @Type(()=> Number)
    @IsOptional()
    page?:number = 1;

    @IsPositive()
    @Type(()=> Number)
    @IsOptional()
    limit?:number = 10;
}
