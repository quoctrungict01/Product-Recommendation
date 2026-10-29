import { BASE_URL } from "../constants/app";
export const getImageProduct = (imageName)=>{
    return `${BASE_URL}/images/products/${imageName}`;
}
