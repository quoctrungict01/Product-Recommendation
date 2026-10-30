import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getCategories } from "./services/Api";
import { Provider } from "react-redux";
import store from "./redux-setup/store";

// Import Layout
import DefaultLayout, { ShopLayout, FullWidthLayout } from "./shared/components/Layout/DefaultLayout";

// Import Pages
import Home from "./pages/Home";
import Category from "./pages/Category";
import ProductDetails from "./pages/ProductDetails";
import Search from "./pages/Search";
import Cart from "./pages/Cart";
import Success from "./pages/Success";
import NotFound from "./pages/NotFound";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import Account from "./pages/Account";
import Profile from "./pages/Account/Profile";
import AccountAddress from "./pages/Account/Address";
import MyOrders from "./pages/Account/Orders";

const App = () => {
  // eslint-disable-next-line
  const [categories, setCategories] = React.useState([]);
  React.useEffect(() => {
    getCategories().then(({data})=>{
      setCategories(data.data.docs);
    });
  }, []);

  return (
    <Provider store={store}>
      <BrowserRouter>
          <Routes>
            <Route path="/" element={<DefaultLayout />}>
              {/* Trang mua sắm: có cột banner. Slideshow chỉ ở trang chủ (trong Home). */}
              <Route element={<ShopLayout />}>
                <Route index element={<Home />} />
                <Route path="/Category-:id" element={<Category />} />
                <Route
                  path="/ProductDetails-:id"
                  element={<ProductDetails />}
                />
                <Route path="/Search" element={<Search />} />
                <Route path="/Cart" element={<Cart />} />
                <Route path="/Success" element={<Success />} />
              </Route>
              {/* Tài khoản và 404: toàn bộ chiều rộng, không banner/slideshow. */}
              <Route element={<FullWidthLayout />}>
                <Route path="/account" element={<Account />}>
                  <Route index element={<Navigate to="/account/profile" replace />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="address" element={<AccountAddress />} />
                  <Route path="orders" element={<MyOrders />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
            <Route path="/login" element={<Login/>} />
            <Route path="/register" element={<Register/>} />
          </Routes>
            
      </BrowserRouter>
    </Provider>
  );
};

export default App;