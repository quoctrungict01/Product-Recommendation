import React from "react";
const Comment = () => {
    return (
        <>
            <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
                <div className="row">
                    <ol className="breadcrumb">
                        <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                        <li className="active">Quản lý bình luận</li>
                    </ol>
                </div>{/*/.row*/}
                <div className="row">
                    <div className="col-lg-12">
                        <h1 className="page-header">Quản lý bình luận</h1>
                    </div>
                </div>{/*/.row*/}
                <div id="toolbar" className="btn-group">
                    <a href="#" className="btn btn-success">
                        Comment
                    </a>
                </div>
                <div className="row">
                    <div className="col-md-12">
                        <div className="panel panel-default">
                            <div className="panel-body">
                                <table data-toolbar="#toolbar" data-toggle="table">
                                    <thead>
                                        <tr>
                                            <th data-field="id" data-sortable="true">ID</th>
                                            <th>Người bình luận</th>
                                            <th>Nội dung bình luận</th>
                                            <th>Hành động</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{}}>1</td>
                                            <td style={{}}>Nguyễn Văn A</td>
                                            <td style={{}}>Nội dung A</td>
                                            <td className="form-group">
                                                <a href="/" className="btn btn-danger"><i className="glyphicon glyphicon" />Xóa</a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style={{}}>2</td>
                                            <td style={{}}>Nguyễn Văn B</td>
                                            <td style={{}}>Nội dung B</td>
                                            <td className="form-group">
                                                <a href="/" className="btn btn-danger"><i className="glyphicon glyphicon" />Xóa</a>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
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
export default Comment;