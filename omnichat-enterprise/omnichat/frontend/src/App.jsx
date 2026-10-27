import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Building2, Send, Paperclip, Video, FileText, 
  Globe, Phone, Mail, Lock, CreditCard, CheckCircle, LogOut, Users, Shield, Cpu
} from 'lucide-react';

// URL dinámica usando Vite (.env o respaldo directo a Ngrok)
const API_URL = import.meta.env.VITE_API_URL || 'https://idiom-slashing-barrier.ngrok-free.dev';
const TOKEN_KEY = 'omnichat_token';

export default function App() {
  const [view, setView] = useState('LANDING'); // LANDING, LOGIN, REGISTER, PRICING, APP
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

  // Estados de Formulario de Autenticación
  const [authMode, setAuthMode] = useState('EMAIL'); // EMAIL, PHONE, GOOGLE
  const [companyName, setCompanyName] = useState('');
  const [identifier, setIdentifier] = useState(''); // Email o Teléfono
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('STANDARD');

  // Estados del Chat y WebSockets
  const [socket, setSocket] = useState(null);
  const [currentChannel, setCurrentChannel] = useState({ id: 'GENERAL', name: 'General - Empresa' });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const messagesEndRef = useRef(null);

  // Inicializar Socket.io al autenticarse
  useEffect(() => {
    if (token && user) {
      const newSocket = io(API_URL, {
        auth: { token }
      });
      setSocket(newSocket);
      setView('APP');

      return () => newSocket.close();
    }
  }, [token, user]);

  // Manejo de salas y canales en tiempo real
  useEffect(() => {
    if (!socket || !user) return;

    socket.emit('join_project', {
      projectCode: currentChannel.id,
      userName: user.email || user.phone,
      companyName: user.companyName
    });

    socket.on('message_history', (history) => setMessages(history));
    socket.on('receive_message', (msg) => setMessages((prev) => [...prev, msg]));

    return () => {
      socket.off('message_history');
      socket.off('receive_message');
    };
  }, [socket, currentChannel, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // REGISTRO DE EMPRESA / USUARIO
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyName, 
          identifier, 
          password, 
          authType: authMode,
          plan: selectedPlan 
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setView('APP');
      } else {
        alert(data.error || 'Error en el registro.');
      }
    } catch (err) {
      alert('No se pudo conectar con el servidor.');
    }
  };

  // INICIO DE SESIÓN
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, authType: authMode })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setView('APP');
      } else {
        alert(data.error || 'Credenciales inválidas.');
      }
    } catch (err) {
      alert('Error de autenticación con el servidor.');
    }
  };

  // ENVÍO DE MENSAJES Y ARCHIVOS
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    let fileData = null;
    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      try {
        const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
        fileData = await res.json();
      } catch (err) {
        alert('Error al subir el archivo.');
        return;
      }
      setSelectedFile(null);
    }

    const payload = {
      projectCode: currentChannel.id,
      companyName: user.companyName,
      sender: user.email || user.phone || 'Usuario',
      text: inputText,
      file: fileData,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send_message', payload);
    setInputText('');
  };

  const logout = () => {
    localStorage.clear();
    setToken('');
    setUser(null);
    setView('LANDING');
  };

  // 1. LANDING PAGE GLOBAL (PÁGINA DE VENTAS TIPO MICROSOFT TEAMS)
  if (view === 'LANDING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
        <header className="border-b border-slate-800/80 p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">OmniChat <span className="text-indigo-400">Enterprise</span></span>
          </div>
          <div className="space-x-4">
            <button onClick={() => setView('LOGIN')} className="px-5 py-2.5 border border-slate-700 rounded-xl text-sm font-medium hover:bg-slate-900 transition">Iniciar Sesión</button>
            <button onClick={() => setView('PRICING')} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-600/30 transition">Ver Planes ($5/mes)</button>
          </div>
        </header>

        <main className="max-w-5xl mx-auto text-center px-6 py-24">
          <span className="bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs px-4 py-1.5 rounded-full font-semibold uppercase tracking-widest">
            Plataforma Global de Colaboración Corporativa
          </span>
          <h1 className="text-6xl font-black mt-6 tracking-tight leading-tight">
            Todo tu equipo conectado en <span className="text-indigo-400">Tiempo Real</span>.
          </h1>
          <p className="text-slate-400 mt-6 text-xl max-w-2xl mx-auto font-normal">
            Mensajería segura por departamentos, canales privados, transferencia de archivos pesados y videollamadas HD para cualquier tipo de empresa.
          </p>
          <div className="mt-10 flex justify-center space-x-4">
            <button onClick={() => setView('PRICING')} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl shadow-xl shadow-indigo-600/30 transition">
              Comenzar Prueba Gratis (14 Días)
            </button>
          </div>
        </main>

        <footer className="border-t border-slate-900 p-6 text-center text-slate-600 text-sm">
          OmniChat Enterprise © 2026. Todos los derechos reservados.
        </footer>
      </div>
    );
  }

  // 2. TABLA DE PRECIOS Y MONETIZACIÓN ($5 USD / MES)
  if (view === 'PRICING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 max-w-5xl mx-auto flex flex-col justify-center">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black">Planes Simples y Transparentes</h2>
          <p className="text-slate-400 mt-2 text-lg">14 días de prueba gratis en todos los planes. Luego solo $5 USD al mes por usuario.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto w-full">
          {/* Plan Estándar Mensual */}
          <div className="bg-slate-900 border-2 border-indigo-600 p-8 rounded-3xl flex flex-col justify-between relative shadow-2xl shadow-indigo-600/20">
            <span className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-indigo-600 text-white font-bold text-xs px-4 py-1 rounded-full uppercase tracking-wider">MÁS POPULAR</span>
            <div>
              <h3 className="text-2xl font-bold">Plan Corporativo Global</h3>
              <p className="text-4xl font-black mt-4">$5 <span className="text-sm font-normal text-slate-400">USD / mes</span></p>
              <ul className="mt-6 space-y-4 text-sm text-slate-300">
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Canales y Departamentos Ilimitados</li>
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Envío de Archivos y Documentos</li>
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Videollamadas HD Integradas</li>
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Aislamiento Multi-Tenant Seguro</li>
              </ul>
            </div>
            <button onClick={() => { setSelectedPlan('GLOBAL_PRO'); setView('REGISTER'); }} className="mt-8 w-full py-4 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-2xl shadow-lg transition">
              Iniciar Prueba de 14 Días
            </button>
          </div>

          {/* Plan Anual o Enterprise */}
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col justify-between">
            <div>
              <h3 className="text-2xl font-bold">Enterprise Dedicado</h3>
              <p className="text-4xl font-black mt-4">$49 <span className="text-sm font-normal text-slate-400">USD / mes</span></p>
              <ul className="mt-6 space-y-4 text-sm text-slate-300">
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Todo lo del plan Global</li>
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Servidor Dedicado Exclusivo</li>
                <li className="flex items-center"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" /> Soporte Técnico Prioritario 24/7</li>
              </ul>
            </div>
            <button onClick={() => { setSelectedPlan('ENTERPRISE'); setView('REGISTER'); }} className="mt-8 w-full py-4 border border-slate-700 hover:bg-slate-800 font-bold rounded-2xl transition">
              Contratar Enterprise
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. REGISTRO MULTIPLATAFORMA (GOOGLE, TELÉFONO, EMAIL) + PASARELA DE PAGO
  if (view === 'REGISTER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-1">Crea tu Espacio Corporativo</h2>
          <p className="text-center text-xs text-indigo-400 mb-6 font-medium">Incluye 14 días gratis • Luego ${selectedPlan === 'GLOBAL_PRO' ? '5' : '49'} USD/mes</p>

          {/* Selector de Método de Autenticación */}
          <div className="grid grid-cols-3 gap-2 mb-6 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button onClick={() => setAuthMode('EMAIL')} className={`py-2 text-xs font-bold rounded-lg transition ${authMode === 'EMAIL' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Email</button>
            <button onClick={() => setAuthMode('PHONE')} className={`py-2 text-xs font-bold rounded-lg transition ${authMode === 'PHONE' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Teléfono</button>
            <button onClick={() => setAuthMode('GOOGLE')} className={`py-2 text-xs font-bold rounded-lg transition ${authMode === 'GOOGLE' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Google</button>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Nombre de la Empresa</label>
              <input type="text" required placeholder="Ej. Global Solutions S.A." value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">
                {authMode === 'PHONE' ? 'Número de Teléfono (WhatsApp / SMS)' : 'Correo Electrónico Corporativo'}
              </label>
              <input 
                type={authMode === 'PHONE' ? 'tel' : 'email'} 
                required 
                placeholder={authMode === 'PHONE' ? '+54 9 11 1234-5678' : 'admin@empresa.com'} 
                value={identifier} 
                onChange={e => setIdentifier(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" 
              />
            </div>

            {authMode !== 'GOOGLE' && (
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Contraseña</label>
                <input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
              </div>
            )}

            <div className="border-t border-slate-800 pt-4 mt-2">
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1 flex items-center">
                <CreditCard className="w-4 h-4 mr-2 text-indigo-500" /> Tarjeta de Crédito (Activación Suscripción)
              </label>
              <input type="text" placeholder="4532 •••• •••• 8892" required className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl shadow-lg transition">
              Comenzar Prueba y Activar
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            ¿Ya tienes una cuenta? <button onClick={() => setView('LOGIN')} className="text-indigo-400 underline font-bold">Inicia Sesión</button>
          </p>
        </div>
      </div>
    );
  }

  // 4. LOGIN UNIVERSAL
  if (view === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Email o Teléfono</label>
              <input type="text" required placeholder="admin@empresa.com o teléfono" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Contraseña</label>
              <input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl shadow-lg transition">
              Acceder al Sistema
            </button>
          </form>
          <p className="text-center text-xs text-slate-500 mt-6">
            ¿No tienes cuenta? <button onClick={() => setView('PRICING')} className="text-indigo-400 underline font-bold">Ver Planes</button>
          </p>
        </div>
      </div>
    );
  }

  // 5. APLICACIÓN PRINCIPAL DE CHAT EMPRESARIAL (ESTILO TEAMS)
  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar de Canales y Empresa */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <span className="font-bold text-indigo-400 truncate">{user?.companyName}</span>
            <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">PRO TRIAL</span>
          </div>

          <div className="p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Canales de la Empresa</p>
            <button onClick={() => setCurrentChannel({ id: 'GENERAL', name: 'General - Empresa' })} className="w-full text-left bg-indigo-600 text-white p-3 rounded-xl font-bold text-sm shadow-md">
              # General
            </button>
            <button onClick={() => setCurrentChannel({ id: 'VENTAS', name: 'Equipo de Ventas' })} className="w-full text-left hover:bg-slate-800 text-slate-300 p-3 rounded-xl font-medium text-sm transition">
              # Ventas & Comercial
            </button>
            <button onClick={() => setCurrentChannel({ id: 'SOPORTE', name: 'Soporte Técnico' })} className="w-full text-left hover:bg-slate-800 text-slate-300 p-3 rounded-xl font-medium text-sm transition">
              # Soporte & Operaciones
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-xs font-bold text-slate-200 truncate">{user?.email || user?.phone}</p>
            <p className="text-[10px] text-slate-500">Administrador</p>
          </div>
          <button onClick={logout} className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-xl transition" title="Cerrar Sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Panel Central del Chat */}
      <div className="flex-1 flex flex-col bg-slate-950">
        <div className="h-16 border-b border-slate-800 px-6 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <span className="text-lg font-bold">#{currentChannel.name}</span>
          </div>
          <button onClick={() => alert('Iniciando conferencia segura en vivo...')} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center shadow-lg transition">
            <Video className="w-4 h-4 mr-2" /> Videollamada HD
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === (user?.email || user?.phone) ? 'justify-end' : 'justify-start'}`}>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl max-w-md shadow-md">
                <div className="flex justify-between items-center mb-1 space-x-4">
                  <span className="text-xs font-bold text-indigo-400">{m.sender}</span>
                  <span className="text-[10px] text-slate-500">{m.timestamp}</span>
                </div>
                {m.text && <p className="text-sm leading-relaxed">{m.text}</p>}
                {m.file && (
                  <a href={m.file.url} target="_blank" rel="noreferrer" className="mt-3 block p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex items-center justify-between hover:border-indigo-500 transition">
                    <span className="truncate mr-2 font-medium">{m.file.originalName}</span>
                    <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  </a>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input de Mensaje */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center space-x-3">
          <label className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer transition border border-slate-700">
            <Paperclip className="w-5 h-5 text-slate-300" />
            <input type="file" className="hidden" onChange={e => setSelectedFile(e.target.files[0])} />
          </label>
          <input type="text" placeholder={`Enviar mensaje a #${currentChannel.name}...`} value={inputText} onChange={e => setInputText(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl font-bold shadow-lg transition">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}