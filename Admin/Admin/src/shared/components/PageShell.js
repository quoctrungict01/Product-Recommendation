import React from "react";
import { Link } from "react-router-dom";

/** Khung chung của một trang quản trị (breadcrumb + tiêu đề) theo template Lumino sẵn có. */
const PageShell = ({ title, crumbs = [], actions = null, children }) => (
    <div className="col-sm-9 col-sm-offset-3 col-lg-10 col-lg-offset-2 main">
        <div className="row">
            <ol className="breadcrumb">
                <li>
                    <Link to="/" aria-label="Trang chủ quản trị">
                        <svg className="glyph stroked home">
                            <use xlinkHref="#stroked-home" />
                        </svg>
                    </Link>
                </li>
                {crumbs.map((c) => (
                    <li key={c.label} className={c.to ? "" : "active"}>
                        {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
                    </li>
                ))}
            </ol>
        </div>
        <div className="row">
            <div className="col-lg-12">
                <h1 className="page-header" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span>{title}</span>
                    {actions ? <small style={{ display: "flex", gap: 8 }}>{actions}</small> : null}
                </h1>
            </div>
        </div>
        {children}
    </div>
);

export default PageShell;
