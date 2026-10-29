// import React, { useEffect } from "react";
// import { getUsers } from "../../services/Api";

// const User = () => {
//     const [users, setUsers] = React.useState([]);
//     React.useEffect(() => {
//         getUsers().then(({ data }) => {
//             setUsers(data.data.docs);
//             console.log(data);
//         });
//     }, []);
//     return (
//         <>
//             <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
//                 <div className="row">
//                     <ol className="breadcrumb">
//                         <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
//                         <li className="active">Danh sách thành viên</li>
//                     </ol>
//                 </div>{/*/.row*/}
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <h1 className="page-header">Danh sách thành viên</h1>
//                     </div>
//                 </div>{/*/.row*/}
//                 <div id="toolbar" className="btn-group">
//                     <a href="thanhvien-add.html" className="btn btn-success">
//                         <i className="glyphicon glyphicon-plus" /> Thêm thành viên
//                     </a>
//                 </div>
//                 <div className="row">
//                     <div className="col-lg-12">
//                         <div className="panel panel-default">
//                             <div className="panel-body">
//                                 <table data-toolbar="#toolbar" data-toggle="table">
//                                     <thead>
//                                         <tr>
//                                             <th data-field="id" data-sortable="true">ID</th>
//                                             <th data-field="name" data-sortable="true">Họ &amp; Tên</th>
//                                             <th data-field="price" data-sortable="true">Email</th>
//                                             <th>Quyền</th>
//                                             <th>Hành động</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {
//                                             users.map((user, index) =>
//                                                 <tr key={index}>
//                                                     <td style={{}}>{index+1}</td>
//                                                     <td style={{}}>{user?.name}</td>
//                                                     <td style={{}}>{user?.email}</td>
//                                                     <td><span className={user.role === 'admin' ? 'label label-danger' : 'label label-success'}>{user?.role}</span></td>
//                                                     <td className="form-group">
//                                                         <a href="thanhvien-edit.html" className="btn btn-primary"><i className="glyphicon glyphicon-pencil" /></a>
//                                                         <a href="/" className="btn btn-danger"><i className="glyphicon glyphicon-remove" /></a>
//                                                     </td>
//                                                 </tr>

//                                             )
//                                         }

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
// export default User;



import React, { useEffect, useState } from "react";
import { getUsers } from "../../services/Api";
import { Table, Button } from "react-bootstrap";

const User = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {

        const fetchData = async () => {
            try {
                const { data } = await getUsers();
                setUsers(data.data.docs);
                setLoading(false);
                console.log(data);
            } catch (error) {
                console.error("Error fetching data: ", error);
            }
        };
        fetchData();
    }, []);

    // if (loading) {
    //     return <div>Loading...</div>;
    // }

    
    const thStyle = {
        paddingLeft: '5px'
    };

    return (
        <>
        <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
            <div className="row">
                <ol className="breadcrumb">
                    <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                    <li className="active">Danh sách thành viên</li>
                </ol>
            </div>{/*/.row*/}
            <div className="row">
                <div className="col-lg-12">
                    <h1 className="page-header">Danh sách thành viên</h1>
                </div>
            </div>{/*/.row*/}
            <div id="toolbar" className="btn-group">
                <Button href="thanhvien-add.html" className="btn btn-success">
                    <i className="glyphicon glyphicon-plus" /> Thêm thành viên
                </Button>
            </div>
            <div className="row">
                <div className="col-lg-12">
                    <div className="panel panel-default">
                        <div className="panel-body">
                            <Table striped bordered hover>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>ID</th>
                                        <th style={thStyle}>Họ &amp; Tên</th>
                                        <th style={thStyle}>Email</th>
                                        <th style={thStyle}>Quyền</th>
                                        <th style={thStyle}>Hành động</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user, index) => (
                                        <tr key={index}>
                                            <td>{index + 1}</td>
                                            <td>{user?.full_name}</td>
                                            <td>{user?.email}</td>
                                            <td>
                                                <span className={user.role === 'admin' ? 'label label-danger' : 'label label-success'}>
                                                    {user?.role}
                                                </span>
                                            </td>
                                            <td className="form-group">
                                                <a href="thanhvien-edit.html" className="btn btn-primary"><i className="glyphicon glyphicon-pencil" /></a>
                                                <a href="/" className="btn btn-danger"><i className="glyphicon glyphicon-remove" /></a>
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

export default User;


