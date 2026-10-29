// import React from "react";
// import { createProduct, getCategories } from "../../services/Api";

// const AddProduct = () => {
//     const [categories, setCategories] = React.useState([]);
//     React.useEffect(() => {
//         getCategories().then(({data})=>{
//           setCategories(data.data.docs);
//         });
//     }, []);
    
//     return (
//         <>
//             <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
//                 <div className="row">
//                     <ol className="breadcrumb">
//                         <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
//                         <li><a href>Quản lý sản phẩm</a></li>
//                         <li className="active">Thêm sản phẩm</li>
//                     </ol>
//                 </div>{/*/.row*/}
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <h1 className="page-header">Thêm sản phẩm</h1>
//                     </div>
//                 </div>{/*/.row*/}
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <div className="panel panel-default">
//                             <div className="panel-body">
//                                 <div className="col-md-6">
//                                     <form role="form" method="post" encType="multipart/form-data">
//                                         <div className="form-group">
//                                             <label>Tên sản phẩm</label>
//                                             <input required name="prd_name" className="form-control" placeholder />
//                                         </div>
//                                         <div className="form-group">
//                                             <label>Giá sản phẩm</label>
//                                             <input required name="prd_price" type="number" min={0} className="form-control" />
//                                         </div>
//                                         <div className="form-group">
//                                             <label>Bảo hành</label>
//                                             <input required name="prd_warranty" type="text" className="form-control" />
//                                         </div>
//                                         <div className="form-group">
//                                             <label>Phụ kiện</label>
//                                             <input required name="prd_accessories" type="text" className="form-control" />
//                                         </div>
//                                         <div className="form-group">
//                                             <label>Khuyến mãi</label>
//                                             <input required name="prd_promotion" type="text" className="form-control" />
//                                         </div>
//                                         <div className="form-group">
//                                             <label>Tình trạng</label>
//                                             <input required name="prd_new" type="text" className="form-control" />
//                                         </div>
//                                     </form></div>
//                                 <div className="col-md-6">
//                                     <div className="form-group">
//                                         <label>Ảnh sản phẩm</label>
//                                         <input required name="prd_image" type="file" />
//                                         <br />
//                                         <div>
//                                             <img src="img/download.jpeg" />
//                                         </div>
//                                     </div>
//                                     <div className="form-group">
//                                         <label>Danh mục</label>
//                                         <select name="cat_id" className="form-control">
//                                             {categories.map((category) => (
//                                                 <option key={category._id} value={category._id}>
//                                                     {category.name}
//                                                 </option>
//                                             ))}
//                                         </select>
//                                     </div>
//                                     <div className="form-group">
//                                         <label>Trạng thái</label>
//                                         <select name="prd_status" className="form-control">
//                                             <option value={1} selected>Còn hàng</option>
//                                             <option value={0}>Hết hàng</option>
//                                         </select>
//                                     </div>
//                                     <div className="form-group">
//                                         <label>Sản phẩm nổi bật</label>
//                                         <div className="checkbox">
//                                             <label>
//                                                 <input name="prd_featured" type="checkbox" defaultValue={1} />Nổi bật
//                                             </label>
//                                         </div>
//                                     </div>
//                                     <div className="form-group">
//                                         <label>Mô tả sản phẩm</label>
//                                         <textarea required name="prd_details" className="form-control" rows={3} defaultValue={""} />
//                                     </div>
//                                     <button name="sbm" type="submit" className="btn btn-success">Thêm mới</button>
//                                     <button type="reset" className="btn btn-default">Làm mới</button>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>{/* /.col*/}
//                 </div>{/* /.row */}
//             </div>	{/*/.main*/}
//         </>
//     );
// }
// export default AddProduct;



import React, { useState, useEffect } from "react";
import { addProduct, getCategories, getProduct } from "../../services/Api";

const AddProduct = () => {
    const [categories, setCategories] = useState([]);
    const [inputProduct, setInputProduct] = useState({
        name: "",
        price: "",
        warranty: "",
        accessories: "",
        promotion: "",
        status: "",
        image: "", // Chuyển image thành string để lưu tên file
        cat_id: "", // Thêm trường cat_id để lưu ID của danh mục sản phẩm
        is_stock: true, // Default to true for 'Còn hàng'
        featured: false,
        details: "",
    });

    useEffect(() => {
        getCategories().then(({ data }) => {
            setCategories(data.data.docs);
        });
    }, []);

    const onChangeInput = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === "cat_id") {
            setInputProduct({
                ...inputProduct,
                [name]: value,
            });
        } else if (name === "is_stock") {
            setInputProduct({
                ...inputProduct,
                [name]: type === "checkbox" ? checked : value === "1" ? true : false,
            });
        } else if (name === "prd_image") {
            setInputProduct({
                ...inputProduct,
                image: e.target.files[0].name, // Lưu tên file hình ảnh vào image
            });
        } else {
            setInputProduct({
                ...inputProduct,
                [name]: type === "checkbox" ? checked : value,
            });
            console.log(inputProduct);
        }
    };

    const onClickSubmit = async () => {
        const formData = new FormData();
        for (const key in inputProduct) {
            if (key === "is_stock") {
                formData.append(key, inputProduct[key] ? "true" : "false");
            } else {
                formData.append(key, inputProduct[key]);
            }
        }
        try {
            const response = await addProduct(formData);
            console.log("Product created successfully:", response.data);
            // Optionally clear form fields after successful submission
            setInputProduct({
                name: "",
                price: "",
                warranty: "",
                accessories: "",
                promotion: "",
                status: "",
                image: "",
                cat_id: "",
                is_stock: true,
                featured: false,
                details: "",
            });
             // Cập nhật danh sách sản phẩm sau khi thêm thành công
        } catch (error) {
            console.error("Error creating product:", error);
        }
    };

    return (
        <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
            <div className="row">
                <ol className="breadcrumb">
                    <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                    <li><a href>Quản lý sản phẩm</a></li>
                    <li className="active">Thêm sản phẩm</li>
                </ol>
            </div>{/*/.row*/}
            <div className="row">
                <div className="col-lg-12">
                    <h1 className="page-header">Thêm sản phẩm</h1>
                </div>
            </div>{/*/.row*/}
            <div className="row">
                <div className="col-lg-12">
                    <div className="panel panel-default">
                        <div className="panel-body">
                            <div className="col-md-6">
                                <form role="form" encType="multipart/form-data">
                                    <div className="form-group">
                                        <label>Tên sản phẩm</label>
                                        <input onChange={onChangeInput} name="name" required className="form-control" value={inputProduct.name} />
                                    </div>
                                    <div className="form-group">
                                        <label>Giá sản phẩm</label>
                                        <input onChange={onChangeInput} name="price" required type="number" min={0} className="form-control" value={inputProduct.price} />
                                    </div>
                                    <div className="form-group">
                                        <label>Bảo hành</label>
                                        <input onChange={onChangeInput} name="warranty" required type="text" className="form-control" value={inputProduct.warranty} />
                                    </div>
                                    <div className="form-group">
                                        <label>Phụ kiện</label>
                                        <input onChange={onChangeInput} name="accessories" required type="text" className="form-control" value={inputProduct.accessories} />
                                    </div>
                                    <div className="form-group">
                                        <label>Khuyến mãi</label>
                                        <input onChange={onChangeInput} name="promotion" required type="text" className="form-control" value={inputProduct.promotion} />
                                    </div>
                                    <div className="form-group">
                                        <label>Tình trạng</label>
                                        <input onChange={onChangeInput} name="status" required type="text" className="form-control" value={inputProduct.status} />
                                    </div>
                                </form>
                            </div>
                            <div className="col-md-6">
                                <div className="form-group">
                                    <label>Ảnh sản phẩm</label>
                                    <input onChange={onChangeInput} name="prd_image" required type="file" />
                                    <br />
                                    <div>
                                        <img src="img/download.jpeg" alt="Preview" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Danh mục</label>
                                    <select onChange={onChangeInput} name="cat_id" className="form-control" value={inputProduct.cat_id}>
                                        {categories.map((category) => (
                                            <option key={category._id} value={category._id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Trạng thái</label>
                                    <select onChange={onChangeInput} name="is_stock" className="form-control" value={inputProduct.is_stock}>
                                        <option value={true}>Còn hàng</option>
                                        <option value={false}>Hết hàng</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Sản phẩm nổi bật</label>
                                    <div className="checkbox">
                                        <label>
                                            <input onChange={onChangeInput} name="featured" type="checkbox" checked={inputProduct.featured} />Nổi bật
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Mô tả sản phẩm</label>
                                    <textarea onChange={onChangeInput} name="details" required className="form-control" rows={3} value={inputProduct.details} />
                                </div>
                                <button type="button" onClick={onClickSubmit} className="btn btn-success">Thêm mới</button>
                                <button type="reset" className="btn btn-default">Làm mới</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>	
    );
}

export default AddProduct;




