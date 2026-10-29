import React from "react";

const Footer = () => {
    return (
        <>
            <div id="footer-top">
                <div className="container">
                    <div className="row">
                        <div id="logo-2" className="col-lg-3 col-md-6 col-sm-12">
                        <h3>Giới thiệu</h3>
                            <p>
                                Chào mừng bạn đến với Trungshop - Tập đoàn bán lẻ hàng đầu về điện thoại di động và các sản phẩm công nghệ tiên tiến tại Việt Nam. Với hơn một thập kỷ hoạt động, Trungshop tự hào là địa chỉ tin cậy cho những người đam mê công nghệ và muốn trải nghiệm những sản phẩm hàng đầu trên thị trường.
                            </p>
                        </div>
                        <div id="address" className="col-lg-3 col-md-6 col-sm-12">
                            <h3>Địa chỉ</h3>
                            <p>Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội</p>
                            <p>P777, nhà B1, trường Đại học Bách khoa Hà Nội</p>
                        </div>
                        <div id="service" className="col-lg-3 col-md-6 col-sm-12">
                            <h3>Dịch vụ</h3>
                            <p>Bảo hành rơi vỡ, ngấm nước</p>
                            <p>Bảo hành rơi vỡ ngấm nước vẫn Đổi mới</p>
                        </div>
                        <div id="hotline" className="col-lg-3 col-md-6 col-sm-12">
                            <h3>Hotline</h3>
                            <p>Phone Sale: (+84) 0904104109 - 0912010581</p>
                            <p>Email: hust@gmail.com</p>
                        </div>
                    </div>
                </div>
            </div>
            {/*	Footer	*/}
            <div id="footer-bottom">
                <div className="container">
                    <div className="row">
                        <div className="col-lg-12 col-md-12 col-sm-12">
                            <p>
                                2023 cửa hàng trên khắp cả nước. Đến với trung shop là sự lựa chọn hoàn toàn đúng đắn.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {/*	End Footer	*/}
        </>
    )
}
export default Footer;