import React from "react";
import { UPDATE_CART, DELETE_ITEM_CART } from "../../shared/constants/action-type";
import { useSelector, useDispatch } from "react-redux";
import { getImageProduct } from "../../shared/ultils";
import { useNavigate } from "react-router-dom";
import { order } from "../../services/Api";


const Cart = () => {
    const [inputs, setInputs] = React.useState({});
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const carts = useSelector(({ Cart }) => {
        return Cart.items;
    });
    const onClickOrder = (e)=>{
        e.preventDefault();
        const items = carts.map((cart)=>({prd_id: cart._id, price: cart.price, qty: cart.qty}));
        order({
            items,
            ...inputs
        }).then(({data})=>{
            if(data.status === "success"){
                return navigate("/Success");
            }
        });
    }
    const onChangeInput = (e)=>{
        const {name, value} = e.target;
        setInputs({...inputs, [name]: value});
        console.log(inputs);
    }
    const deleteItemCart = (e, _id)=>{
        e.preventDefault();
        // eslint-disable-next-line no-restricted-globals
        const isConfirm = confirm("bạn muốn xóa sản phẩm khỏi giỏ hàng không?");
        if(isConfirm){
            dispatch({
                type: DELETE_ITEM_CART,
                payload: {
                    _id
                },
            })
        }else{
            return false;
        }
    }
    const updateCart = (e, _id) => {
        const val = parseInt(e.target.value);
        if (val > 0) {
            dispatch({
                type: UPDATE_CART,
                payload: {
                    _id,
                    qty: val,
                }
            });
        }else{
            // eslint-disable-next-line no-restricted-globals
            const isConfirm = confirm("bạn muốn xóa sản phẩm khỏi giỏ hàng không?");
            if(isConfirm){
                dispatch({
                    type: DELETE_ITEM_CART,
                    payload: {
                        _id
                    },
                })
            }else{
                dispatch({
                    type: UPDATE_CART,
                    payload:{
                        _id,
                        qty:1,
                    }
                })
            }
        }
    }
    return (
        <>
            <div>
                {/*	Cart	*/}
                <div id="my-cart">
                    <div className="row">
                        <div className="cart-nav-item col-lg-7 col-md-7 col-sm-12">Thông tin sản phẩm</div>
                        <div className="cart-nav-item col-lg-2 col-md-2 col-sm-12">Tùy chọn</div>
                        <div className="cart-nav-item col-lg-3 col-md-3 col-sm-12">Giá</div>
                    </div>
                    <form method="post">
                        {
                            carts?.map((cart) =>
                                <div className="cart-item row">
                                    <div className="cart-thumb col-lg-7 col-md-7 col-sm-12">
                                        <img src={getImageProduct(cart.image)} />
                                        <h4>{cart.name}</h4>
                                    </div>
                                    <div className="cart-quantity col-lg-2 col-md-2 col-sm-12">
                                        <input onChange={(e) => updateCart(e, cart._id)} type="number" id="quantity" className="form-control form-blue quantity" value={cart.qty} />
                                    </div>
                                    <div className="cart-price col-lg-3 col-md-3 col-sm-12"><b>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(cart.qty * cart.price)}</b><a onClick={(e)=>deleteItemCart(e, cart._id)} href="#">Xóa</a></div>
                                </div>
                            )
                        }

                        <div className="row">
                            <div className="cart-thumb col-lg-7 col-md-7 col-sm-12">
                            </div>
                            <div className="cart-total col-lg-2 col-md-2 col-sm-12"><b>Tổng cộng:</b></div>
                            <div className="cart-price col-lg-3 col-md-3 col-sm-12"><b>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(carts?.reduce((total, item) => total + item.qty * item.price, 0))}</b></div>
                        </div>
                    </form>
                </div>
                {/*	End Cart	*/}
                {/*	Customer Info	*/}
                <div id="customer">
                    <form method="post">
                        <div className="row">
                            <div onChange={onChangeInput} value={inputs?.fullName} id="customer-name" className="col-lg-4 col-md-4 col-sm-12">
                                <input placeholder="Họ và tên (bắt buộc)" type="text" name="fullName" className="form-control" required />
                            </div>
                            <div onChange={onChangeInput} value={inputs?.phone} id="customer-phone" className="col-lg-4 col-md-4 col-sm-12">
                                <input placeholder="Số điện thoại (bắt buộc)" type="text" name="phone" className="form-control" required />
                            </div>
                            <div onChange={onChangeInput} value={inputs?.email} id="customer-mail" className="col-lg-4 col-md-4 col-sm-12">
                                <input placeholder="Email (bắt buộc)" type="text" name="email" className="form-control" required />
                            </div>
                            <div onChange={onChangeInput} value={inputs?.address} id="customer-add" className="col-lg-12 col-md-12 col-sm-12">
                                <input placeholder="Địa chỉ nhà riêng hoặc cơ quan (bắt buộc)" type="text" name="address" className="form-control" required />
                            </div>
                        </div>
                    </form>
                    <div className="row">
                        <div className="by-now col-lg-6 col-md-6 col-sm-12">
                            <a onClick={onClickOrder} href="#">
                                <b>Mua ngay</b>
                                <span>Giao hàng tận nơi siêu tốc</span>
                            </a>
                        </div>
                        <div className="by-now col-lg-6 col-md-6 col-sm-12">
                            <a href="#">
                                <b>Trả góp Online</b>
                                <span>Vui lòng call (+84) 0988 550 553</span>
                            </a>
                        </div>
                    </div>
                </div>
                {/*	End Customer Info	*/}
            </div>

        </>
    )
}
export default Cart;