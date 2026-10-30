// Đường dẫn tới file tĩnh trong thư mục public/ (ảnh banner, slide, logo...).
// Luôn tính từ GỐC ứng dụng: "images/a.jpg" ở trang /account/profile sẽ bị trình duyệt hiểu thành
// /account/images/a.jpg (không tồn tại -> dev server trả index.html). PUBLIC_URL rỗng khi chạy ở "/".
// Không dùng cho ảnh sản phẩm (do backend phục vụ, xem getImageProduct).
export const publicAsset = (path) => `${process.env.PUBLIC_URL || ""}/${String(path).replace(/^\/+/, "")}`;
