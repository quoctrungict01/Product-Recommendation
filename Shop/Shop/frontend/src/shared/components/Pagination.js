// Frontend/src/shared/components/Pagination.js
import React from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";

const Pagination = ({ pages }) => {
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();

    // Lấy các thông số từ object pages do backend trả về
    const {
        totalRows,
        totalPages,
        currentPage,
        hasNext,
        hasPrev,
        prev,
        next,
    } = pages;

    if (!totalPages || totalPages <= 1) return null;

    // Tạo URL cho từng trang — giữ nguyên tất cả query params hiện có, chỉ thay page
    const formatUrl = (page) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", page);
        return `${pathname}?${params.toString()}`;
    };

    // Tạo mảng các số trang cần hiển thị theo kiểu: 1 ... 8 9 [10] 11 12 ... N
    function renderPagesArray(delta = 2) {
        const pagesArr = [];
        const left = currentPage - delta;
        const right = currentPage + delta;

        for (let i = 1; i <= totalPages; i++) {
            if (
                i === 1 ||
                i === currentPage ||
                i === totalPages ||
                (i >= left && i <= right)
            ) {
                pagesArr.push(i);
            }
        }
        return pagesArr;
    }

    const pagesArray = renderPagesArray();

    // Thêm dấu "..." vào giữa các số trang không liên tiếp
    const renderWithEllipsis = () => {
        const result = [];
        for (let i = 0; i < pagesArray.length; i++) {
            result.push(pagesArray[i]);
            // Nếu số trang kế tiếp không liên tiếp → chèn "..."
            if (pagesArray[i + 1] && pagesArray[i + 1] - pagesArray[i] > 1) {
                result.push("...");
            }
        }
        return result;
    };

    return (
        <ul className="pagination">
            {/* Nút Trang trước */}
            {hasPrev ? (
                <li className="page-item">
                    <Link className="page-link" to={formatUrl(prev)}>
                        Trang trước
                    </Link>
                </li>
            ) : null}

            {/* Danh sách các trang */}
            {renderWithEllipsis().map((page, index) =>
                page === "..." ? (
                    <li key={`ellipsis-${index}`} className="page-item disabled">
                        <span className="page-link">...</span>
                    </li>
                ) : (
                    <li
                        key={page}
                        className={`page-item ${page === currentPage ? "active" : ""}`}
                    >
                        <Link className="page-link" to={formatUrl(page)}>
                            {page}
                        </Link>
                    </li>
                )
            )}

            {/* Nút Trang sau */}
            {hasNext ? (
                <li className="page-item">
                    <Link className="page-link" to={formatUrl(next)}>
                        Trang sau
                    </Link>
                </li>
            ) : null}
        </ul>
    );
};

export default Pagination;