import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api' });

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [email, setEmail] = useState('admin@local.com');
  const [password, setPassword] = useState('123456');
  const [products, setProducts] = useState([]);
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => { if (token) { api.defaults.headers.common.Authorization = `Bearer ${token}`; load(); } }, [token]);
  const load = async () => {
    const [p, d] = await Promise.all([api.get('/products'), user?.role === 'ADMIN' ? api.get('/dashboard') : Promise.resolve({ data: null })]);
    setProducts(p.data); setDashboard(d.data);
  };
  const login = async () => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token); setUser(data.user); localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
  };
  const exportExcel = () => { const ws = XLSX.utils.json_to_sheet(products); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Produtos'); XLSX.writeFile(wb, 'produtos.xlsx'); };
  const exportPdf = () => { const doc = new jsPDF(); doc.text('Relatório de Produtos', 10, 10); products.slice(0, 20).forEach((p, i) => doc.text(`${p.name} - estoque ${p.stock}`, 10, 20 + i*8)); doc.save('produtos.pdf'); };

  if (!token) return <div className='min-h-screen flex items-center justify-center p-4'><div className='bg-white p-6 rounded-xl w-full max-w-sm space-y-3'><h1 className='text-xl font-bold'>Login</h1><input className='w-full border p-2 rounded' value={email} onChange={e=>setEmail(e.target.value)} /><input type='password' className='w-full border p-2 rounded' value={password} onChange={e=>setPassword(e.target.value)} /><button className='w-full bg-blue-600 text-white p-3 rounded' onClick={login}>Entrar</button></div></div>;

  return <div className='min-h-screen flex'>
    <aside className='w-56 bg-slate-900 text-white p-4 hidden md:block'><h2 className='font-bold'>Consignação</h2><p>{user?.name}</p></aside>
    <main className='flex-1 p-4 space-y-4'>
      <div className='flex flex-wrap gap-2'><button onClick={load} className='bg-blue-600 text-white px-4 py-3 rounded'>Atualizar</button><button onClick={exportExcel} className='bg-emerald-600 text-white px-4 py-3 rounded'>Excel</button><button onClick={exportPdf} className='bg-rose-600 text-white px-4 py-3 rounded'>PDF</button></div>
      {dashboard && <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        <Card title='Total vendido' value={dashboard.totalSold} />
        <Card title='Lucro' value={dashboard.lucro} />
      </div>}
      <div className='bg-white rounded-xl p-4 overflow-auto'><h3 className='font-semibold mb-2'>Produtos</h3><table className='w-full text-sm'><thead><tr><th>Nome</th><th>Preço</th><th>Estoque</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.salePrice}</td><td>{p.stock}</td></tr>)}</tbody></table></div>
    </main>
  </div>
}

const Card = ({ title, value }) => <div className='bg-white rounded-xl p-4'><p className='text-xs'>{title}</p><p className='text-xl font-bold'>R$ {Number(value||0).toFixed(2)}</p></div>;

createRoot(document.getElementById('root')).render(<App />);
