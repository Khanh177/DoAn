import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TrangChu from './pages/users/HomePage';
import LoginForm from './pages/users/Login';
import RegisterForm from './pages/users/Register';
import ChatBot from './pages/users/GoldPredict/Chatbot';
import Wallet from './pages/users/wallet/Wallet'; 
import News from './pages/users/News';
import ForexTrading from './pages/users/ForexTrading/ForexTrading';
import WorldGold from './pages/users/world_gold/World_gold';
import DomesticGold from './pages/users/domestic_gold/Domestic_gold';
import P2P from './pages/users/P2P/P2P_trade';
import Complaint from './pages/users/complaint/Complaint';


import Login from './pages/admin/Login';
import AdminLayout from './pages/admin/layout/Layout';
import Dashboard from './pages/admin/Dashboard';
import QuanLyNapTien from './pages/admin/deposits/DepositForm';
import ProtectedRoute from './pages/admin/layout/ProtectedRoute';
import AdminP2PDisputes from './pages/admin/p2p/AdminP2PDisputes';
import AdminP2PPosts from './pages/admin/p2p/AdminP2PPosts';
import QuanLyUser from './pages/admin/users/UsersForm';
import QuanLyTinTuc from './pages/admin/news/NewsForm';
// import QuanLyGiaoDich  from './src/pages/admin/QuanLyGiaoDich';
import QuanLyVangTrongNuoc from './pages/admin/domestic/ManageDomesticGold';
import ComplaintAdmin from './pages/admin/complaint/ComplaintAdmin';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TrangChu />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/register" element={<RegisterForm />} />
        <Route path="/chatbot" element={<ChatBot />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/news" element={<News />} />
        <Route path="/futures" element={<ForexTrading />} />
        <Route path="/world-gold" element={<WorldGold />} />
        <Route path="/domestic-gold" element={<DomesticGold />} />
        <Route path="/p2p" element={<P2P />} />
        <Route path="/complaint" element={<Complaint />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="deposits" element={<QuanLyNapTien />} />
          <Route path="p2p" element={<AdminP2PPosts />} />
          <Route path="p2p/disputes" element={<AdminP2PDisputes />} />
          <Route path="users" element={<QuanLyUser />} />
          <Route path="news" element={<QuanLyTinTuc />} />
          {/* <Route path="giao-dich" element={<QuanLyGiaoDich />} /> */}
          <Route path="domestic-gold-price" element={<QuanLyVangTrongNuoc />} />
          <Route path="complaints" element={<ComplaintAdmin />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
