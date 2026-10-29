// import React from "react";
// import { Link } from "react-router-dom";
// const Product = () => {
//     return (
//         <>
//             <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
//                 <div className="row">
//                     <ol className="breadcrumb">
//                         <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
//                         <li className="active">Danh sách sản phẩm</li>
//                     </ol>
//                 </div>{/*/.row*/}
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <h1 className="page-header">Danh sách sản phẩm</h1>
//                     </div>
//                 </div>{/*/.row*/}
//                 <div id="toolbar" className="btn-group">
//                     <Link to="/product-add" className="btn btn-success">
//                         <i className="glyphicon glyphicon-plus" /> Thêm sản phẩm
//                     </Link>
//                 </div>
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <div className="panel panel-default">
//                             <div className="panel-body">
//                                 <table data-toolbar="#toolbar" data-toggle="table">
//                                     <thead>
//                                         <tr>
//                                             <th data-field="id" data-sortable="true">ID</th>
//                                             <th data-field="name" data-sortable="true">Tên sản phẩm</th>
//                                             <th data-field="price" data-sortable="true">Giá</th>
//                                             <th>Ảnh sản phẩm</th>
//                                             <th>Trạng thái</th>
//                                             <th>Danh mục</th>
//                                             <th>Hành động</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         <tr>
//                                             <td style={{}}>1</td>
//                                             <td style={{}}>Sản phẩm số 1</td>
//                                             <td style={{}}>18.500.000 vnd</td>
//                                             <td style={{ textAlign: 'center' }}><img width={130} height={180} src="img/download.jpeg" /></td>
//                                             <td><span className="label label-success">Còn hàng</span></td>
//                                             <td>Danh mục số 1</td>
//                                             <td className="form-group">
//                                                 <a href="/product-edit" className="btn btn-primary"><i className="glyphicon glyphicon-pencil" /></a>
//                                                 <a href="product-edit.html" className="btn btn-danger"><i className="glyphicon glyphicon-remove" /></a>
//                                             </td>
//                                         </tr>
//                                         <tr>
//                                             <td style={{}}>1</td>
//                                             <td style={{}}>Sản phẩm số 2</td>
//                                             <td style={{}}>18.500.000 vnd</td>
//                                             <td style={{ textAlign: 'center' }}><img width={130} height={180} src="img/download.jpeg" /></td>
//                                             <td><span className="label label-danger">Hết hàng</span></td>
//                                             <td>Danh mục số 1</td>
//                                             <td className="form-group">
//                                                 <a href="/product-edit" className="btn btn-primary"><i className="glyphicon glyphicon-pencil" /></a>
//                                                 <a href="/product-delete" className="btn btn-danger"><i className="glyphicon glyphicon-remove" /></a>
//                                             </td>
//                                         </tr>
//                                     </tbody>
//                                 </table>
//                             </div>
//                             <div className="panel-footer">
//                                 <nav aria-label="Page navigation example">
//                                     <ul className="pagination">
//                                         <li className="page-item"><a className="page-link" href="#">«</a></li>
//                                         <li className="page-item"><a className="page-link" href="#">1</a></li>
//                                         <li className="page-item"><a className="page-link" href="#">2</a></li>
//                                         <li className="page-item"><a className="page-link" href="#">3</a></li>
//                                         <li className="page-item"><a className="page-link" href="#">»</a></li>
//                                     </ul>
//                                 </nav>
//                             </div>
//                         </div>
//                     </div>
//                 </div>{/*/.row*/}
//             </div>	{/*/.main*/}

//         </>
//     );
// }
// export default Product;



import React, {useEffect, useState} from "react";
import { getProducts } from "../../services/Api";
import { getImageProduct } from "../../shared/ultils";
import { Link, useParams } from "react-router-dom";
import { Table, Button } from 'react-bootstrap';

const Product = () => {

    const [product, setProduct] = React.useState([]);
    const [ loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data } = await getProducts();
                setProduct(data.data.docs);
                setLoading(false);
                console.log(data); // Optional: Kiểm tra dữ liệu trả về từ API
            } catch (error) {
                console.error("Error fetching data: ", error);
            }
        };
        fetchData();
    }, []);

        const tableStyle = {
        borderCollapse: 'collapse',
        width: '100%'
    };

    const thStyle = {
        paddingLeft: '5px'
    };


    return (
        <>
            <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
                <div className="row">
                    <ol className="breadcrumb">
                        <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                        <li className="active">Danh sách sản phẩm</li>
                    </ol>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <h1 className="page-header">Danh sách sản phẩm</h1>
                    </div>
                </div>{/*/.row*/}
                <div id="toolbar" className="btn-group">
                    <Link to="/product-add" className="btn btn-success">
                        <i className="glyphicon glyphicon-plus" /> Thêm sản phẩm
                    </Link>
                </div>
                <div className="row">
                    <div className="col-lg-12">
                        <div className="panel panel-default">
                            <div className="panel-body">
                                <Table style={tableStyle} striped bordered hover >
                                    <thead>
                                        <tr>
                                            <th data-field="id" data-sortable="true">ID</th>
                                            <th data-field="name" data-sortable="true">Tên sản phẩm</th>
                                            <th data-field="price" data-sortable="true">Giá</th>
                                            <th>Ảnh sản phẩm</th>
                                            <th>Trạng thái</th>
                                            <th>Danh mục</th>
                                            <th>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {product.map((item, index)=>(
                                        <tr key={index}>
                                            <td>{index+1}</td>
                                            <td style={{}}>{item.name}</td>
                                            <td style={{}}>{item.price}</td>
                                            <td style={{ textAlign: 'center' }}><img width={130} height={180} src={getImageProduct(item.image)} alt={product.name} /></td>
                                            <td><span className="label label-success">{item.is_stock}</span></td>
                                            <td>Danh mục số 1</td>
                                            <td className="form-group">
                                                <a href="/product-edit" className="btn btn-primary"><i className="glyphicon glyphicon-pencil" /></a>
                                                <a href="product-edit.html" className="btn btn-danger"><i className="glyphicon glyphicon-remove" /></a>
                                            </td>
                                        </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </div>
                            <div className="panel-footer">
                                <nav aria-label="Page navigation example">
                                    <ul className="pagination">
                                        <li className="page-item"><a className="page-link" href="#">«</a></li>
                                        <li className="page-item"><a className="page-link" href="#">1</a></li>
                                        <li className="page-item"><a className="page-link" href="#">2</a></li>
                                        <li className="page-item"><a className="page-link" href="#">3</a></li>
                                        <li className="page-item"><a className="page-link" href="#">»</a></li>
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>{/*/.row*/}
            </div>	{/*/.main*/}

        </>
    );
}
export default Product;