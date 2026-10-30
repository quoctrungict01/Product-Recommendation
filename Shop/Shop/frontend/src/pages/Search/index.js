// Trang tìm kiếm: từ khóa lấy từ URL (?q=..., vẫn nhận ?keyword=... của link cũ), kết hợp bộ lọc/sắp xếp/phân trang.
import React from "react";
import ProductBrowser from "../../shared/components/ProductBrowser";

const Search = () => (
    <ProductBrowser
        renderTitle={({ q }) => (
            <div id="search-result">
                {q ? (
                    <>
                        Kết quả tìm kiếm với sản phẩm <span>{q}</span>
                    </>
                ) : (
                    "Tất cả sản phẩm"
                )}
            </div>
        )}
    />
);

export default Search;
