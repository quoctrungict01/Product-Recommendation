// Trang sau khi đặt hàng. Chỉ hiển thị thông tin có thật do backend trả về lúc đặt (mã đơn, tổng tiền).
// Hệ thống chưa gửi email xác nhận nên không nhắc tới email.
// Thông tin nằm trong state của điều hướng: tải lại trang hoặc vào thẳng /Success thì không còn -> báo rõ.
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { orderCode } from "../../shared/ultils/profile";

const formatMoney = (n) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? `${new Intl.NumberFormat("vi-VN").format(n)}đ` : null);

const Success = ({ clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined }) => {
  const location = useLocation();
  const state = location.state || {};
  const orderId = state.orderId;
  const total = formatMoney(state.totalPrice);
  const isLoggedIn = useSelector(({ Auth }) => Auth.isLoggedIn);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, []);

  if (!orderId) {
    return (
      <div id="order-success">
        <div className="row">
          <div id="order-success-txt" className="col-lg-12 col-md-12 col-sm-12">
            <h3>Không có thông tin đơn hàng để hiển thị</h3>
            <p>Trang này chỉ hiện ngay sau khi bạn đặt hàng.</p>
            {isLoggedIn ? (
              <p>Xem các đơn đã đặt tại <Link to="/account/orders">Đơn hàng của tôi</Link>.</p>
            ) : (
              <p>Nếu bạn vừa đặt hàng, hãy dùng mã đơn đã lưu để liên hệ cửa hàng. <Link to="/">Về trang chủ</Link></p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const code = orderCode(orderId);
  const copy = () => {
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    clipboard.writeText(code).then(
      () => setCopied("Đã sao chép mã đơn."),
      () => setCopied("Không sao chép được, bạn hãy ghi lại mã đơn.")
    );
  };

  return (
    <>
      {/* Order Success */}
      <div id="order-success">
        <div className="row">
          <div id="order-success-img" className="col-lg-3 col-md-3 col-sm-12" />
          <div id="order-success-txt" className="col-lg-9 col-md-9 col-sm-12">
            <h3>Bạn đã đặt hàng thành công!</h3>
            <p>
              Mã đơn hàng của bạn: <b>{code}</b>{" "}
              {clipboard ? (
                <button type="button" className="btn btn-default btn-xs" onClick={copy}>
                  Sao chép mã
                </button>
              ) : null}
            </p>
            {copied ? <p role="status">{copied}</p> : null}
            {total ? <p>Tổng thanh toán: <b>{total}</b></p> : null}
            <p>Đơn hàng đang ở trạng thái <b>Chờ xác nhận</b>. Cửa hàng sẽ xác nhận và giao hàng theo thông tin bạn đã nhập.</p>
            {isLoggedIn ? (
              <p>
                Bạn có thể theo dõi trạng thái đơn tại <Link to="/account/orders">Đơn hàng của tôi</Link>.
              </p>
            ) : (
              <p>
                Bạn đặt hàng khi chưa đăng nhập nên đơn không gắn với tài khoản nào. Hãy <b>lưu lại mã đơn {code}</b> để
                liên hệ cửa hàng khi cần hỏi về đơn hàng.
              </p>
            )}
            <p><Link to="/">Tiếp tục mua sắm</Link></p>
          </div>
        </div>
      </div>
      {/* End Order Success */}
    </>
  );
};

export default Success;
