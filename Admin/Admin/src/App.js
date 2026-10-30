import React from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";

// Import Layout
import Header from "./shared/components/Layout/Header";
import Sidebar from "./shared/components/Layout/Sidebar";
import RequireAdmin from "./shared/auth/RequireAdmin";

// Import Pages
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Category from "./pages/Category";
import User from "./pages/User";
import AddUser from "./pages/User/AddUser";
import EditUser from "./pages/User/EditUser";
import Product from "./pages/Product";
import AddProduct from "./pages/Product/AddProduct";
import EditProduct from "./pages/Product/EditProduct";
import Comment from "./pages/Comment";
import Order from "./pages/Order";
import OrderDetail from "./pages/Order/Detail";
import Coupon from "./pages/Coupon";
import CouponForm from "./pages/Coupon/CouponForm";
import AddCategory from "./pages/Category/AddCategory";
import Login from "./pages/Login";

/** Khung trang quản trị: chỉ hiện khi đã đăng nhập admin. */
const AdminLayout = () => (
  <RequireAdmin>
    <div>
      <div>
        <Header />
        <Sidebar />
      </div>
      <Outlet />
    </div>
  </RequireAdmin>
);

export const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<AdminLayout />}>
      <Route path="/" element={<Dashboard />} />
      <Route path="/category" element={<Category />} />
      <Route path="/category-add" element={<AddCategory />} />
      <Route path="/user" element={<User />} />
      <Route path="/user-add" element={<AddUser />} />
      <Route path="/user-edit/:id" element={<EditUser />} />
      <Route path="/product" element={<Product />} />
      <Route path="/product-add" element={<AddProduct />} />
      <Route path="/product-edit/:id" element={<EditProduct />} />
      <Route path="/product-edit" element={<Navigate to="/product" replace />} />
      <Route path="/comment" element={<Comment />} />
      <Route path="/order" element={<Order />} />
      <Route path="/order/:id" element={<OrderDetail />} />
      <Route path="/coupon" element={<Coupon />} />
      <Route path="/coupon-add" element={<CouponForm />} />
      <Route path="/coupon-edit/:id" element={<CouponForm />} />
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
);

const App = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App;
