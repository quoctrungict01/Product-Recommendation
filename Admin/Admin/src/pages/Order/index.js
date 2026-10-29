import React, { useEffect, useState } from "react";
import { getOrders } from "../../services/Api";
import { Table } from 'react-bootstrap';

const Order = () => {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        // Gọi API để lấy danh sách đơn hàng khi component được mount
        getOrders()
        .then(({ data }) => {
            setOrders(data.data);
            console.log(data.data);
        });
    }, []); // useEffect sẽ chạy chỉ một lần khi component mount

    const cardStyle = {
        marginBottom: '20px',
        padding: '15px',
        border: '2px solid blue',
        borderRadius: '5px'
    };

    const tableHeaderStyle = {
        backgroundColor: "#6699FF",
        color: "#FFFFFF",
        paddingLeft: '10px'
    };

    return (
        <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
            <div className="row">
                <ol className="breadcrumb">
                    <li><a href="#"><svg className="glyph stroked home"><use xlinkHref="#stroked-home" /></svg></a></li>
                    <li className="active">Thống kê đơn hàng</li>
                </ol>
            </div>{/*/.row*/}
            <div className="row">
                <div className="col-lg-12">
                    <h1 className="page-header">Thống kê đơn hàng</h1>
                </div>
            </div>{/*/.row*/}
            {orders.map((order, index) => (
                <div key={order._id} style={cardStyle}>
                    <div>
                        <p>
                            <b>Khách hàng:</b> {order.fullName}<br />
                            <b>Điện thoại:</b> {order.phone}<br />
                            <b>Địa chỉ:</b> {order.address}<br />
                        </p>
                    </div>
                    <div>
                        <Table bordered hover>
                            <thead>
                                <tr>
                                    <th width="70%" style={tableHeaderStyle}>Sản phẩm</th>
                                    <th width="10%" style={tableHeaderStyle}>Số lượng</th>
                                    <th width="20%" style={tableHeaderStyle}>Tổng tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {order.items.map((item) => (
                                    <tr key={item._id}>
                                        <td>{item.product}</td> {/* Hiển thị tên sản phẩm từ item.product */}
                                        <td>{item.qty}</td>
                                        <td>{item.price.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</td>
                                    </tr>
                                ))}
                                <tr>
                                    <td colSpan="2"></td>
                                    <td><b><font color="#FF0000">{order.totalPrice.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</font></b></td>
                                </tr>
                            </tbody>
                        </Table>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default Order;








