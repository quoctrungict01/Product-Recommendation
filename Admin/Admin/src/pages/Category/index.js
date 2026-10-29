// import React from "react";
// import { getCategories } from "../../services/Api";

// const Category = () => {
//     const [categories, setCategories] = React.useState([]);
//     React.useEffect(() => {
//         getCategories().then(({ data }) => {
//             setCategories(data.data.docs);
//             console.log(data);
//         });
//     }, []);
//     return (
//         <>
//             <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
//                 <div className="row">
//                     <ol className="breadcrumb">
//                         <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
//                         <li className="active">Quản lý danh mục</li>
//                     </ol>
//                 </div>{/*/.row*/}
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <h1 className="page-header">Quản lý danh mục</h1>
//                     </div>
//                 </div>{/*/.row*/}
//                 <div id="toolbar" className="btn-group">
//                     <a href="category-add.html" className="btn btn-success">
//                         <i className="glyphicon glyphicon-plus" /> Thêm danh mục
//                     </a>
//                 </div>
//                 <div className="row">
//                     <div className="col-md-12">
//                         <div className="panel panel-default">
//                             <div className="panel-body">
//                                 <table data-toolbar="#toolbar" data-toggle="table">
//                                     <thead>
//                                         <tr>
//                                             <th data-field="id" data-sortable="true">ID</th>
//                                             <th>Tên danh mục</th>
//                                             <th>Hành động</th>
//                                         </tr>
//                                     </thead>
//                                     {categories.length > 0 && (
//                                         <tbody>
//                                             {categories.map((category, index) =>
//                                                 <tr key={index}>
//                                                     <td>{index + 1}</td>
//                                                     <td>{category?.name}</td>
//                                                     <td className="form-group">
//                                                         <a href="/" className="btn btn-primary"><i className="glyphicon glyphicon" />Sửa</a>
//                                                         <a href="/" className="btn btn-danger"><i className="glyphicon glyphicon" />Xóa</a>
//                                                     </td>
//                                                 </tr>
//                                             )}
//                                         </tbody>
//                                     )}
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
// export default Category;


import React from "react";
import { getCategories } from "../../services/Api";
import { Link } from "react-router-dom";
import { Table, Button } from 'react-bootstrap';

const Category = () => {
    const [categories, setCategories] = React.useState([]);
    React.useEffect(() => {
        getCategories().then(({ data }) => {
            setCategories(data.data.docs);
            console.log(data);
        });
    }, []);

    // Định nghĩa CSS trực tiếp trong JSX
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
                        <li className="active">Quản lý danh mục</li>
                    </ol>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <h1 className="page-header">Quản lý danh mục</h1>
                    </div>
                </div>{/*/.row*/}
                <div id="toolbar" className="btn-group">
                    <Link to="/category-add" className="btn btn-success">
                        <i className="glyphicon glyphicon-plus" /> Thêm danh mục
                    </Link>
                </div>
                <div className="row">
                    <div className="col-md-12">
                        <div className="panel panel-default">
                            <div className="panel-body">
                                <Table style={tableStyle} striped bordered hover >
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>ID</th>
                                            <th style={thStyle}>Tên danh mục</th>
                                            <th style={thStyle}>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map((category, index) =>
                                            <tr key={index}>
                                                <td>{index + 1}</td>
                                                <td>{category?.name}</td>
                                                <td className="form-group">
                                                    <a href="/category-edit" className="btn btn-primary"><i className="glyphicon glyphicon" />Sửa</a>
                                                    <a href="/category-delete" className="btn btn-danger"><i className="glyphicon glyphicon" />Xóa</a>
                                                </td>
                                            </tr>
                                        )}
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
export default Category;



