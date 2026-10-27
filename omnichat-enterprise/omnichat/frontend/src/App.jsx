import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { 
  Building2, Send, Paperclip, Video, FileText, 
  Globe, Phone, Mail, Lock, CreditCard, CheckCircle, LogOut, Users, Shield, Cpu, Copy
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://omnichat-backend-t56k.onrender.com';
const TOKEN_KEY = 'omnichat_token';

export default function App() {
  const [view, setView] = useState('LANDING'); // LANDING, LOGIN, REGISTER, PRICING, BILLING, APP
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [company, setCompany] = useState(JSON.parse(localStorage.getItem('company') || 'null'));

  // Estados de Formulario
  const [authMode, setAuthMode] = useState('EMAIL');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('STANDARD');

  // Facturación
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Chat y WebSockets
  const [socket, setSocket] = useState(null);
  const [currentChannel, setCurrentChannel] = useState({ id: 'general', name: 'General - Empresa' });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (token && user) {
      const newSocket = io(API_URL, { auth: { token } });
      setSocket(newSocket);
      
      if (company && company.access && !company.access.ok) {
        setView('BILLING');
      } else {
        setView('APP');
      }

      return () => newSocket.close();
    }
  }, [token, user]);

  useEffect(() => {
    if (!socket || !user || view !== 'APP') return;

    socket.emit('channel:join', currentChannel.id, (res) => {
      if (res && res.error === 'SUBSCRIPTION_REQUIRED') {
        setView('BILLING');
      }
    });

    fetch(`${API_URL}/api/channels/${currentChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (res.status === 402) {
          setView('BILLING');
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});

    socket.on('message:new', (msg) => {
      if (msg.channelId === currentChannel.id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.off('message:new');
    };
  }, [socket, currentChannel, user, token, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email: identifier.toLowerCase(), 
          password, 
          companyName: inviteCode ? undefined : companyName,
          inviteCode: inviteCode ? inviteCode.trim().toUpperCase() : undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        setView('APP');
      } else {
        alert(data.error || 'Error en el registro.');
      }
    } catch (err) {
      alert('No se pudo conectar con el servidor.');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier.toLowerCase(), password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        setCompany(data.company);
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('company', JSON.stringify(data.company));
        
        if (data.company && data.company.access && !data.company.access.ok) {
          setView('BILLING');
        } else {
          setView('APP');
        }
      } else {
        alert(data.error || 'Credenciales inválidas.');
      }
    } catch (err) {
      alert('Error de autenticación con el servidor.');
    }
  };

  const handleSubscribe = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/billing/subscribe`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ holder: cardHolder, cardNumber, exp: cardExp, cvc: cardCvc })
      });
      const data = await res.json();
      if (res.ok) {
        setCompany(data.company);
        localStorage.setItem('company', JSON.stringify(data.company));
        alert('¡Suscripción activada con éxito!');
        setView('APP');
      } else {
        alert(data.error || 'Error al procesar la tarjeta.');
      }
    } catch (err) {
      alert('Error de conexión con la pasarela de pagos.');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (inputText.trim()) formData.append('body', inputText.trim());

      try {
        const res = await fetch(`${API_URL}/api/channels/${currentChannel.id}/files`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (res.status === 402) {
          setView('BILLING');
          return;
        }
        setSelectedFile(null);
        setInputText('');
      } catch (err) {
        alert('Error al subir el archivo.');
      }
      return;
    }

    socket.emit('message:send', { channelId: currentChannel.id, body: inputText }, (ack) => {
      if (ack && ack.error === 'SUBSCRIPTION_REQUIRED') {
        setView('BILLING');
      }
    });
    setInputText('');
  };

  const logout = () => {
    localStorage.clear();
    setToken('');
    setUser(null);
    setCompany(null);
    setView('LANDING');
  };

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

  if (view === 'PRICING') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 max-w-5xl mx-auto flex flex-col justify-center">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black">Planes Simples y Transparentes</h2>
          <p className="text-slate-400 mt-2 text-lg">14 días de prueba gratis sin tarjeta de crédito. Luego solo $5 USD al mes.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto w-full">
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
            <button onClick={() => { setSelectedPlan('STANDARD'); setView('REGISTER'); }} className="mt-8 w-full py-4 bg-indigo-600 hover:bg-indigo-500 font-bold rounded-2xl shadow-lg transition">
              Iniciar Prueba de 14 Días
            </button>
          </div>

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

  if (view === 'REGISTER') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-1">Crea tu Espacio Corporativo</h2>
          <p className="text-center text-xs text-indigo-400 mb-6 font-medium">14 días de prueba gratis • No requiere tarjeta ahora</p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Tu Nombre Completo</label>
              <input type="text" required placeholder="Ej. Juan Pérez" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Nombre de la Empresa</label>
              <input type="text" required={!inviteCode} placeholder="Ej. Global Solutions S.A." value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <div className="border-t border-b border-slate-800/80 py-3 my-1">
              <label className="block text-xs uppercase font-bold text-indigo-400 mb-1">
                ¿Tienes Código de Invitación?
              </label>
              <input 
                type="text" 
                placeholder="Ingresa el código si te invitaron" 
                value={inviteCode} 
                onChange={e => setInviteCode(e.target.value.toUpperCase())} 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none uppercase tracking-widest font-mono" 
              />
            </div>

            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Correo Electrónico Corporativo</label>
              <input type="email" required placeholder="admin@empresa.com" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Contraseña</label>
              <input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl shadow-lg transition mt-2">
              Comenzar Prueba Gratis
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            ¿Ya tienes una cuenta? <button onClick={() => setView('LOGIN')} className="text-indigo-400 underline font-bold">Inicia Sesión</button>
          </p>
        </div>
      </div>
    );
  }

  if (view === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-black text-center mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Correo Electrónico</label>
              <input type="email" required placeholder="admin@empresa.com" value={identifier} onChange={e => setIdentifier(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
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

  if (view === 'BILLING') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-indigo-600/50 p-8 rounded-3xl max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-3 py-1 rounded-full font-semibold">PRUEBA GRATUITA FINALIZADA</span>
            <h2 className="text-2xl font-black mt-3">Activa tu Suscripción</h2>
            <p className="text-xs text-slate-400 mt-1">Ingresa tus datos de pago para continuar disfrutando de OmniChat Enterprise ($5 USD/mes).</p>
          </div>

          <form onSubmit={handleSubscribe} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Titular de la Tarjeta</label>
              <input type="text" required placeholder="Nombre como figura en la tarjeta" value={cardHolder} onChange={e => setCardHolder(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Número de Tarjeta</label>
              <input type="text" required placeholder="4242 4242 4242 4242" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">Vencimiento (MM/YY)</label>
                <input type="text" required placeholder="12/28" value={cardExp} onChange={e => setCardExp(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs uppercase font-bold text-slate-400 mb-1">CVC</label>
                <input type="password" required placeholder="123" maxLength="4" value={cardCvc} onChange={e => setCardCvc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl shadow-lg transition mt-4">
              Autorizar y Continuar ($5 USD)
            </button>
          </form>

          <div className="mt-6 text-center">
            <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-300 underline">Cerrar Sesión</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      {/* Sidebar de Canales y Empresa */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-indigo-400 truncate">{company?.name || 'Mi Empresa'}</span>
              <span className="bg-indigo-500/20 text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">PRO TRIAL</span>
            </div>

            {/* MOSTRAR CÓDIGO DE INVITACIÓN */}
            {company?.inviteCode && (
              <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between mt-2">
                <div className="truncate pr-2">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Código Invitación</p>
                  <p className="text-xs font-mono font-bold text-indigo-300 tracking-widest select-all">{company.inviteCode}</p>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(company.inviteCode);
                    alert('¡Código de invitación copiado al portapapeles!');
                  }} 
                  className="text-[10px] bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 px-2.5 py-1.5 rounded-lg font-bold transition flex-shrink-0"
                >
                  Copiar
                </button>
              </div>
            )}
          </div>

          <div className="p-4 space-y-1">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Canales de la Empresa</p>
            <button onClick={() => setCurrentChannel({ id: 'general', name: 'General - Empresa' })} className={`w-full text-left p-3 rounded-xl font-bold text-sm transition ${currentChannel.id === 'general' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}>
              # General
            </button>
            <button onClick={() => setCurrentChannel({ id: 'ventas', name: 'Equipo de Ventas' })} className={`w-full text-left p-3 rounded-xl font-bold text-sm transition ${currentChannel.id === 'ventas' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}>
              # Ventas & Comercial
            </button>
            <button onClick={() => setCurrentChannel({ id: 'soporte', name: 'Soporte Técnico' })} className={`w-full text-left p-3 rounded-xl font-bold text-sm transition ${currentChannel.id === 'soporte' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'}`}>
              # Soporte & Operaciones
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="truncate pr-2">
            <p className="text-xs font-bold text-slate-200 truncate">{user?.name || user?.email}</p>
            <p className="text-[10px] text-slate-500 capitalize">{user?.role || 'Miembro'}</p>
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
          <div className="flex items-center space-x-3">
            {user?.role === 'owner' && (
              <button onClick={() => setView('BILLING')} className="bg-slate-800 hover:bg-slate-700 text-indigo-400 px-3 py-2 rounded-xl text-xs font-bold border border-slate-700 transition">
                Gestionar Suscripción
              </button>
            )}
            <button onClick={() => alert('Iniciando conferencia segura en vivo...')} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-sm font-bold flex items-center shadow-lg transition">
              <Video className="w-4 h-4 mr-2" /> Videollamada HD
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl max-w-md shadow-md">
                <div className="flex justify-between items-center mb-1 space-x-4">
                  <span className="text-xs font-bold text-indigo-400">{m.userName}</span>
                  <span className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {m.body && <p className="text-sm leading-relaxed">{m.body}</p>}
                {m.file && (
                  <a href={`${API_URL}/api/files/${m.file.id}/download`} target="_blank" rel="noreferrer" className="mt-3 block p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs flex items-center justify-between hover:border-indigo-500 transition">
                    <span className="truncate mr-2 font-medium">{m.file.name}</span>
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