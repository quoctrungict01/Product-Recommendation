// Trang "Thêm danh mục" riêng (link cũ /category-add). Gửi { name } — trước đây gửi cat_name nên luôn lỗi 400.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { addCategory } from "../../services/Api";
import { apiMessage } from "../../shared/ultils/format";
import { categoryNameError } from "./index";
import PageShell from "../../shared/components/PageShell";
import Notice from "../../shared/components/Notice";

const AddCategory = ({ api = { addCategory } }) => {
    const [name, setName] = useState("");
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        const err = categoryNameError(name);
        if (err) return setNotice({ type: "danger", text: err });
        setBusy(true);
        try {
            await api.addCategory({ name: name.trim() });
            setNotice({ type: "success", text: `Đã thêm danh mục "${name.trim()}".` });
            setName("");
        } catch (er) {
            setNotice({ type: "danger", text: apiMessage(er, "Không thêm được danh mục.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <PageShell title="Thêm danh mục" crumbs={[{ label: "Quản lý danh mục", to: "/category" }, { label: "Thêm danh mục" }]}>
            <div className="panel panel-default">
                <div className="panel-body">
                    <Notice notice={notice} />
                    <form onSubmit={onSubmit} noValidate>
                        <div className="form-group">
                            <label htmlFor="add-cat-name">Tên danh mục</label>
                            <input id="add-cat-name" className="form-control" maxLength={100} placeholder="Tên danh mục..." value={name} onChange={(e) => { setName(e.target.value); setNotice(null); }} />
                        </div>
                        <button type="submit" className="btn btn-success" disabled={busy}>
                            Thêm mới
                        </button>{" "}
                        <Link to="/category" className="btn btn-default">
                            Về danh sách
                        </Link>
                    </form>
                </div>
            </div>
        </PageShell>
    );
};

export default AddCategory;
