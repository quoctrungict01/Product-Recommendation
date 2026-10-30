import React from "react";
import { useParams } from "react-router-dom";
import ProductForm from "./ProductForm";

const EditProduct = () => {
    const { id } = useParams();
    return <ProductForm key={id} productId={id} />;
};

export default EditProduct;
