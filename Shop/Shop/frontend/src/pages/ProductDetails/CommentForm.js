import React from "react";

/**
 * Form bình luận: chỉ hiện cho người đã đăng nhập (backend cũng bắt buộc đăng nhập).
 * Khách thấy lời mời đăng nhập. Tên/email lấy từ tài khoản, người dùng chỉ nhập nội dung.
 */
const CommentForm = ({ isLoggedIn, user, content, error, onChange, onSubmit, LinkComponent }) => {
    if (!isLoggedIn) {
        return (
            <p className="comment-login-required">
                Vui lòng <LinkComponent to="/login">đăng nhập</LinkComponent> để bình luận về sản phẩm.
            </p>
        );
    }
    const displayName = (user && (user.full_name || (user.email && user.email.split("@")[0]))) || "Bạn";
    return (
        <form method="post" onSubmit={onSubmit}>
            <p>
                Bình luận với tên <b>{displayName}</b>
            </p>
            <div className="form-group">
                <label htmlFor="comment-content">Nội dung:</label>
                <textarea id="comment-content" onChange={onChange} name="content" required maxLength={1000} rows={8} className="form-control" value={content} />
            </div>
            {error ? (
                <p className="text-danger" role="alert">
                    {error}
                </p>
            ) : null}
            <button type="submit" name="sbm" className="btn btn-primary">
                Gửi
            </button>
        </form>
    );
};

export default CommentForm;
