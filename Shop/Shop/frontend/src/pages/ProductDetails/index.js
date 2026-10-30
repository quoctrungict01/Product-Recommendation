// import React, { useState, useEffect } from "react";
// import { ADD_TO_CART } from "../../shared/constants/action-type";
// import { useDispatch } from "react-redux";
// import moment from "moment";
// import { getProduct, getCommentProduct, createCommentProduct } from "../../services/Api";
// import { useParams, useNavigate } from "react-router-dom";
// import { getImageProduct } from "../../shared/ultils";
// import { formatPrice } from "../../shared/components/Product-item";

// const ProductDetails = () => {
//   const params = useParams();
//   const id = params.id;
//   const [product, setProduct] = useState(null);
//   const [comments, setComments] = useState([]);
//   const [inputComment, setInputComment] = useState({});
//   const [showOutOfStockMessage, setShowOutOfStockMessage] = useState(false);
//   const dispatch = useDispatch();
//   const navigate = useNavigate();
//   const formattedPrice = formatPrice(product?.price);

//   useEffect(() => {
//     // Lấy thông tin sản phẩm khi component được tạo
//     getProduct(id).then(({ data }) => {
//       setProduct(data.data);
//     });

//     // Lấy danh sách bình luận của sản phẩm
//     getComment(id);
//   }, [id]);

//   // Hàm lấy danh sách bình luận của sản phẩm
//   const getComment = (id) => {
//     getCommentProduct(id, {}).then(({ data }) => {
//       setComments(data.data.docs);
//     });
//   };

//   // Hàm thêm sản phẩm vào giỏ hàng
//   const addToCart = (type) => {
//     if (product) {
//       const { _id, name, price, image } = product;

//       if (product.is_stock) {
//         // Sản phẩm còn hàng, thêm vào giỏ hàng hoặc chuyển đến trang giỏ hàng
//         dispatch({
//           type: ADD_TO_CART,
//           payload: {
//             _id,
//             name,
//             price,
//             image,
//             qty: 1,
//           },
//         });

//         if (type === "buy-now") {
//           navigate("/Cart");
//         }
//       } else {
//         // Sản phẩm đã hết hàng, hiển thị thông báo
//         setShowOutOfStockMessage(true);
//       }
//     }
//   };

//   // Hàm xử lý khi người dùng gửi bình luận
//   const onClickSubmit = (e) => {
//     e.preventDefault();
//     createCommentProduct(id, inputComment, {}).then(({ data }) => {
//       if (data.status === "success") {
//         setInputComment({});
//       }
//       getComment(id);
//     });
//   };

//   // Hàm xử lý khi người dùng thay đổi nội dung bình luận
//   const onChangeInput = (e) => {
//     const { name, value } = e.target;
//     setInputComment({ ...inputComment, [name]: value });
//   };

//   return (
//     <div className="container">
//       {showOutOfStockMessage && (
//         <div className="alert alert-warning mt-3" role="alert">
//           Sản phẩm đã hết hàng.
//         </div>
//       )}

//       {product && (
//         <div>
//           <div id="product-head" className="row">
//             <div id="product-img" className="col-lg-6 col-md-6 col-sm-12">
//               <img src={getImageProduct(product.image)} alt={product.name} />
//             </div>
//             <div id="product-details" className="col-lg-6 col-md-6 col-sm-12">
//               <h1>{product.name}</h1>
//               <ul>
//                 <li><span>Bảo hành:</span> 12 Tháng</li>
//                 <li><span>Đi kèm:</span> {product.accessories}</li>
//                 <li><span>Tình trạng:</span> {product.status}</li>
//                 <li><span>Khuyến Mại:</span> {product.promotion}đ</li>
//                 <li></li>
//                 <li id="price">Giá Bán (chưa bao gồm VAT)</li>
//                 <li id="price-number">{formattedPrice}đ</li>
//                 <li id="status" style={{ color: product.is_stock ? "green" : "red" }}>
//                   {product.is_stock ? "Còn hàng" : "Hết hàng"}
//                 </li>
//               </ul>
//               <div id="add-cart">
//                 <button onClick={() => addToCart("buy-now")} className="btn btn-warning mr-2">
//                   Mua ngay
//                 </button>
//                 <button onClick={() => addToCart()} className="btn btn-info">
//                   Thêm vào giỏ hàng
//                 </button>
//               </div>
//             </div>
//           </div>

//           <div id="product-body" className="row">
//             <div className="col-lg-12 col-md-12 col-sm-12">
//               <h3>{product.name}</h3>
//               {product.details}
//             </div>
//           </div>

//           <div id="comment" className="row">
//             <div className="col-lg-12 col-md-12 col-sm-12">
//               <h3>Bình luận sản phẩm</h3>
//               <form method="post">
//                 <div className="form-group">
//                   <label>Tên:</label>
//                   <input onChange={onChangeInput} name="name" required type="text" className="form-control" value={inputComment.name || ""} />
//                 </div>
//                 <div className="form-group">
//                   <label>Email:</label>
//                   <input onChange={onChangeInput} name="email" required type="email" className="form-control" id="pwd" value={inputComment.email || ""} />
//                 </div>
//                 <div className="form-group">
//                   <label>Nội dung:</label>
//                   <textarea onChange={onChangeInput} name="content" required rows={8} className="form-control" value={inputComment.content || ""} />
//                 </div>
//                 <button type="submit" onClick={onClickSubmit} name="sbm" className="btn btn-primary">
//                   Gửi
//                 </button>
//               </form>
//             </div>
//           </div>

//           <div id="comments-list" className="row">
//             <div className="col-lg-12 col-md-12 col-sm-12">
//               {comments.map((item) => (
//                 <div className="comment-item" key={item._id}>
//                   <ul>
//                     <li><b>{item.name}</b></li>
//                     <li>{moment(item.createdAt).fromNow()}</li>
//                     <li>{item.content}</li>
//                   </ul>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default ProductDetails;


import React, { useState, useEffect } from "react";
import { ADD_TO_CART } from "../../shared/constants/action-type";
import { useDispatch, useSelector } from "react-redux";
import moment from "moment";
import { getProduct, getCommentProduct, createCommentProduct } from "../../services/Api";
import { useParams, useNavigate, Link } from "react-router-dom";
import CommentForm from "./CommentForm";
import { getImageProduct } from "../../shared/ultils";
import { cleanProductDetails } from "../../shared/ultils/productText";
import PriceTag from "../../shared/components/PriceTag";
import { getPricing, formatMoney } from "../../shared/ultils/pricing";
import FrequentlyBoughtTogether from "../../shared/components/FrequentlyBoughtTogether";

const ProductDetails = () => {
  const params = useParams();
  const id = params.id;
  const [product, setProduct] = useState(null);
  const [comments, setComments] = useState([]);
  const [inputComment, setInputComment] = useState({});
  const [commentError, setCommentError] = useState("");
  const [cartMessage, setCartMessage] = useState("");
  const { isLoggedIn, user } = useSelector(({ Auth }) => Auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const pricing = getPricing(product);

  const [showPlusOne, setShowPlusOne] = useState(false);

  useEffect(() => {
    // Fetch product details and comments when component mounts.
    // Gợi ý mua kèm do <FrequentlyBoughtTogether> tự tải.
    setCartMessage("");
    getProduct(id).then(({ data }) => {
      setProduct(data.data);
      // Smooth scroll to 200px offset with duration 1000ms
      smoothScrollTo(200, 1000);
    });

    getComment(id);
  }, [id]);

  const getComment = (id) => {
    getCommentProduct(id, {}).then(({ data }) => {
      setComments(data.data.docs);
    });
  };

  const addToCart = (type) => {
    if (product) {
      const { _id, name, image } = product;

      if (product.is_stock === false) {
        setCartMessage("Sản phẩm đã hết hàng.");
      } else if (pricing.price === null) {
        setCartMessage("Sản phẩm chưa có giá bán. Vui lòng liên hệ cửa hàng.");
      } else {
        // Giá trong giỏ chỉ để hiển thị; khi đặt hàng backend tính lại từ database.
        dispatch({
          type: ADD_TO_CART,
          payload: {
            _id,
            name,
            price: pricing.price,
            image,
            qty: 1,
          },
        });

        // Show +1 animation
        setShowPlusOne(true);
        setTimeout(() => {
          setShowPlusOne(false);
        }, 500);

        if (type === "buy-now") {
          navigate("/Cart");
        }
      }
    }
  };

  // Chỉ gửi nội dung: tên/email do backend lấy từ tài khoản đang đăng nhập.
  const onClickSubmit = (e) => {
    e.preventDefault();
    setCommentError("");
    createCommentProduct(id, { content: inputComment.content || "" }, {})
      .then(({ data }) => {
        if (data.status === "success") {
          setInputComment({});
        }
        getComment(id);
      })
      .catch((err) => {
        const status = err.response && err.response.status;
        if (status === 401) setCommentError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để bình luận.");
        else setCommentError((err.response && err.response.data && err.response.data.message) || "Không gửi được bình luận. Vui lòng thử lại.");
      });
  };

  const onChangeInput = (e) => {
    const { name, value } = e.target;
    setInputComment({ ...inputComment, [name]: value });
  };

  // Function to perform smooth scroll
  const smoothScrollTo = (target, duration) => {
    const start = window.pageYOffset;
    const startTime = 'now' in window.performance ? performance.now() : new Date().getTime();

    const scroll = (timestamp) => {
      const currentTime = 'now' in window.performance ? performance.now() : new Date().getTime();
      const timeElapsed = currentTime - startTime;
      const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      window.scrollTo(0, easeInOutQuad(timeElapsed / duration) * (target - start) + start);

      if (timeElapsed < duration) {
        requestAnimationFrame(scroll);
      } else {
        window.scrollTo(0, target);
      }
    };

    requestAnimationFrame(scroll);
  };

  return (
    <div className="container">
      {cartMessage && (
        <div className="alert alert-warning mt-3" role="alert">
          {cartMessage}
        </div>
      )}

      {product && (
        <div>
          <div id="product-head" className="row">
            <div id="product-img" className="col-lg-6 col-md-6 col-sm-12">
              <img src={getImageProduct(product.image)} alt={product.name} />
            </div>
            <div id="product-details" className="col-lg-6 col-md-6 col-sm-12">
              <h1>{product.name}</h1>
              <ul>
                <li><span>Bảo hành:</span> 12 Tháng</li>
                <li><span>Đi kèm:</span> {product.accessories}</li>
                <li><span>Tình trạng:</span> {product.status}</li>
                {pricing.hasDiscount ? (
                  <li><span>Khuyến Mại:</span> Giảm {formatMoney(pricing.original - pricing.price)}đ</li>
                ) : pricing.promotionText ? (
                  <li><span>Khuyến Mại:</span> {pricing.promotionText}</li>
                ) : null}
                <li id="price">Giá Bán (chưa bao gồm VAT)</li>
                <li id="price-number"><PriceTag product={product} size="lg" label="" /></li>
                <li id="status" style={{ color: product.is_stock !== false ? "green" : "red" }}>
                  {product.is_stock !== false ? "Còn hàng" : "Hết hàng"}
                </li>
              </ul>
              <div id="add-cart">
                <button onClick={() => addToCart("buy-now")} className="btn btn-warning mr-2" disabled={product.is_stock === false}>
                  Mua ngay
                </button>
                <button onClick={() => addToCart()} className="btn btn-info" disabled={product.is_stock === false}>
                  Thêm vào giỏ hàng
                </button>
                {showPlusOne && <div className="plus-one">+1</div>}
              </div>
            </div>
          </div>

          <div id="product-body" className="row">
            <div className="col-lg-12 col-md-12 col-sm-12">
              <h3>{product.name}</h3>
              {cleanProductDetails(product.details)}
            </div>
          </div>

          <FrequentlyBoughtTogether productId={id} />

          <div id="comment" className="row">
            <div className="col-lg-12 col-md-12 col-sm-12">
              <h3>Bình luận sản phẩm</h3>
              <CommentForm
                isLoggedIn={isLoggedIn}
                user={user}
                content={inputComment.content || ""}
                error={commentError}
                onChange={onChangeInput}
                onSubmit={onClickSubmit}
                LinkComponent={Link}
              />
            </div>
          </div>

          <div id="comments-list" className="row">
            <div className="col-lg-12 col-md-12 col-sm-12">
              {comments.map((item) => (
                <div className="comment-item" key={item._id}>
                  <ul>
                    <li><b>{item.name}</b></li>
                    <li>{moment(item.createdAt).fromNow()}</li>
                    <li>{item.content}</li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductDetails;






