import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Import Layout
import Header from "./shared/components/Layout/Header";
import Sidebar from "./shared/components/Layout/Sidebar";

// Import Pages
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Category from "./pages/Category";
import User from "./pages/User";
import Product from "./pages/Product";
import AddProduct from "./pages/Product/AddProduct";
import EditProduct from "./pages/Product/EditProduct";
import Comment from "./pages/Comment";
import Order from "./pages/Order";
import AddCategory from "./pages/Category/AddCategory";


const App = () => {

  return (
    <>
      <BrowserRouter>
        <div>
          <div>
            <Header />
            <Sidebar />
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/category" element={<Category />} />
            <Route path="/category-add" element={<AddCategory />} />
            <Route path="/user" element={<User />} />
            <Route path="/product" element={<Product />} />
            <Route path="/product-add" element={<AddProduct />} />
            <Route path="/product-edit" element={<EditProduct />} />
            <Route path="/comment" element={<Comment />} />
            <Route path="/order" element={<Order />} />


            


            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </>
  )
}

export default App;