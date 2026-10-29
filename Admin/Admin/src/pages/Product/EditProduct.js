import React from "react";
const EditProduct = () => {
    return (
        <>
            <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
                <div className="row">
                    <ol className="breadcrumb">
                        <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                        <li><a href>Quản lý sản phẩm</a></li>
                        <li className="active">Sản phẩm số 1</li>
                    </ol>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <h1 className="page-header">Sản phẩm: Sản phẩm số 1</h1>
                    </div>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <div className="panel panel-default">
                            <div className="panel-body">
                                <div className="col-md-6">
                                    <form role="form" method="post" encType="multipart/form-data">
                                        <div className="form-group">
                                            <label>Tên sản phẩm</label>
                                            <input type="text" name="prd_name" required className="form-control" defaultValue="Sản phẩm số 1" placeholder />
                                        </div>
                                        <div className="form-group">
                                            <label>Giá sản phẩm</label>
                                            <input type="number" name="prd_price" required defaultValue={18500000} className="form-control" />
                                        </div>
                                        <div className="form-group">
                                            <label>Bảo hành</label>
                                            <input type="text" name="prd_warranty" required defaultValue="12 tháng" className="form-control" />
                                        </div>
                                        <div className="form-group">
                                            <label>Phụ kiện</label>
                                            <input type="text" name="prd_accessories" required defaultValue="Xạc, Tai nghe..." className="form-control" />
                                        </div>
                                        <div className="form-group">
                                            <label>Khuyến mãi</label>
                                            <input type="text" name="prd_promotion" required defaultValue="Xạc dự phòng" className="form-control" />
                                        </div>
                                        <div className="form-group">
                                            <label>Tình trạng</label>
                                            <input type="text" name="prd_new" required defaultValue="Like new 99%" className="form-control" />
                                        </div>
                                    </form></div>
                                <div className="col-md-6">
                                    <div className="form-group">
                                        <label>Ảnh sản phẩm</label>
                                        <input type="file" name="prd_image" required />
                                        <br />
                                        <div>
                                            <img src="img/download.jpeg" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Danh mục</label>
                                        <select name="cat_id" className="form-control">
                                            <option selected value={1}>iPhone</option>
                                            <option value={2}>Samsung</option>
                                            <option value={3}>Nokia</option>
                                            <option value={4}>LG</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Trạng thái</label>
                                        <select name="prd_status" className="form-control">
                                            <option selected value={1}>Còn hàng</option>
                                            <option value={2}>Hết hàng</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Sản phẩm nổi bật</label>
                                        <div className="checkbox">
                                            <label>
                                                <input name="prd_featured" type="checkbox" defaultValue={1} />Nổi bật
                                            </label>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Mô tả sản phẩm</label>
                                        <textarea name="prd_details" required className="form-control" rows={3} defaultValue={""} />
                                    </div>
                                    <button type="submit" name="sbm" className="btn btn-primary">Cập nhật</button>
                                    <button type="reset" className="btn btn-default">Làm mới</button>
                                </div>
                            </div>
                        </div>
                    </div>{/* /.col*/}
                </div>{/* /.row */}
            </div>	{/*/.main*/}

        </>
    );
}
export default EditProduct;