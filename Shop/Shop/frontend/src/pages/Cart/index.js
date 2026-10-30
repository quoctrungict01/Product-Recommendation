import React from "react";
import { UPDATE_CART, DELETE_ITEM_CART, REFRESH_CART_ITEMS, CLEAR_CART } from "../../shared/constants/action-type";
import { useSelector, useDispatch } from "react-redux";
import { getImageProduct } from "../../shared/ultils";
import { useNavigate } from "react-router-dom";
import CheckoutForm from "./CheckoutForm";
import { getProduct } from "../../services/Api";
import { getPricing } from "../../shared/ultils/pricing";


const Cart = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const carts = useSelector(({ Cart }) => {
        return Cart.items;
    });
    // Giỏ lưu trong trình duyệt có thể có giá cũ: lấy lại giá bán sau ưu đãi và tình trạng hàng từ backend khi mở trang.
    // (Khi đặt hàng backend vẫn tính lại giá từ database — đây chỉ để hiển thị đúng.)
    const cartIds = (carts || []).map((c) => c._id).join(",");
    React.useEffect(() => {
        if (!cartIds) return undefined;
        let alive = true;
        Promise.allSettled(cartIds.split(",").map((id) => getProduct(id))).then((results) => {
            if (!alive) return;
            const items = results
                .filter((r) => r.status === "fulfilled" && r.value && r.value.data && r.value.data.data)
                .map((r) => {
                    const p = r.value.data.data;
                    const { price } = getPricing(p);
                    return price === null ? null : { _id: p._id, price, is_stock: p.is_stock !== false, name: p.name, image: p.image };
                })
                .filter(Boolean);
            if (items.length) dispatch({ type: REFRESH_CART_ITEMS, payload: { items } });
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cartIds]);
    const soldOut = (carts || []).filter((c) => c.is_stock === false);
    // Giá cuối cùng do backend tính từ dữ liệu sản phẩm; khách không cần đăng nhập.
    // Chỉ gọi khi backend đã trả "success" (xem CheckoutForm). Lỗi -> giỏ được giữ nguyên để sửa và thử lại.
    const onOrderSuccess = (data) => {
        dispatch({ type: CLEAR_CART });
        navigate("/Success", { state: { orderId: data._id, totalPrice: data.totalPrice } });
    };
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
                                <div className="cart-item row" key={cart._id}>
                                    <div className="cart-thumb col-lg-7 col-md-7 col-sm-12">
                                        <img src={getImageProduct(cart.image)} alt={cart.name} />
                                        <h4>{cart.name}</h4>
                                        {cart.is_stock === false ? <p className="text-danger" style={{ fontSize: 14 }}>Hết hàng — vui lòng xóa khỏi giỏ để đặt hàng.</p> : null}
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
                {soldOut.length ? (
                    <div className="alert alert-warning" role="alert">
                        Có {soldOut.length} sản phẩm đã hết hàng trong giỏ: {soldOut.map((c) => c.name).join(", ")}. Đơn hàng sẽ không được nhận cho đến khi bạn xóa các sản phẩm này.
                    </div>
                ) : null}
                {/*	Customer Info	*/}
                <CheckoutForm carts={carts} onSuccess={onOrderSuccess} />
                {/*	End Customer Info	*/}
            </div>

        </>
    )
}
export default Cart;