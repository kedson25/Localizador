import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { loginUser, signupUser, User } from '../lib/auth';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (username.trim()) {
      setStep(2);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);
    
    const res = await loginUser(username.trim(), password);
    setIsLoading(false);
    
    if (res.success && res.user) {
      onLogin(res.user);
    } else {
      setErrorMsg(res.message || 'Erro ao fazer login.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (username.trim().length < 3) {
      setErrorMsg('Usuário deve ter pelo menos 3 caracteres.');
      return;
    }
    
    if (!email.includes('@')) {
      setErrorMsg('Insira um e-mail válido.');
      return;
    }
    
    if (password.length < 4) {
      setErrorMsg('Senha deve ter pelo menos 4 caracteres.');
      return;
    }

    setIsLoading(true);
    const res = await signupUser(username.trim(), email.trim(), password);
    setIsLoading(false);
    
    if (res.success) {
      setSuccessMsg('Cadastro realizado! Aguarde aprovação de um Administrador.');
      setMode('login');
      setStep(1);
      setUsername('');
      setPassword('');
      setEmail('');
    } else {
      setErrorMsg(res.message || 'Erro ao criar usuário.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded border border-slate-200 w-full max-w-[380px] overflow-hidden">
        
        <div className="bg-slate-50 border-b border-slate-200 py-5 flex items-center justify-center">
          <div className="w-12 h-12 bg-white rounded border border-slate-200 flex items-center justify-center overflow-hidden">
             <img 
               src="https://ok3static.oktacdn.com/fs/bco/1/fs01qr8d9ez620FXA1d8" 
               alt="Logo" 
               className="w-10 h-10 object-contain"
               crossOrigin="anonymous"
             />
          </div>
        </div>
        
        <div className="p-6">
          <h2 className="text-sm font-bold text-slate-800 text-center uppercase tracking-wider mb-5">
            {mode === 'login' ? 'Acesso ao Sistema' : 'Novo Usuário'}
          </h2>
          
          {errorMsg && (
            <div className="mb-4 p-2 bg-red-50 border border-red-200 text-red-700 text-xs text-center rounded font-medium">
              {errorMsg}
            </div>
          )}
          
          {successMsg && (
            <div className="mb-4 p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs text-center rounded font-medium">
              {successMsg}
            </div>
          )}

          {mode === 'login' ? (
            step === 1 ? (
              <form onSubmit={handleNext} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Usuário ou E-mail</label>
                  <input 
                    type="text" 
                    value={username}
                    onChange={e => { setUsername(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs font-medium focus:border-[#3483FA] outline-none"
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!username.trim()}
                  className="w-full bg-[#3483FA] hover:bg-blue-600 disabled:bg-slate-300 text-white py-2 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  Avançar
                </button>
                <div className="pt-2 text-center">
                  <button 
                    type="button" 
                    onClick={() => { setMode('signup'); setErrorMsg(''); setSuccessMsg(''); setUsername(''); setPassword(''); }}
                    className="text-xs text-[#3483FA] hover:underline cursor-pointer"
                  >
                    Criar novo usuário
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                     <label className="text-xs font-semibold text-slate-700">Senha</label>
                     <button 
                       type="button" 
                       onClick={() => { setStep(1); setErrorMsg(''); setSuccessMsg(''); }}
                       className="text-[11px] text-[#3483FA] hover:underline cursor-pointer"
                     >
                       Alterar usuário
                     </button>
                  </div>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={password}
                      onChange={e => { setPassword(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                      className="w-full bg-white border border-slate-300 rounded px-3 py-2 pr-9 text-xs font-medium focus:border-[#3483FA] outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!password.trim() || isLoading}
                  className="w-full bg-[#3483FA] hover:bg-blue-600 disabled:bg-slate-300 text-white py-2 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Usuário</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={e => { setUsername(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs font-medium focus:border-[#3483FA] outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-xs font-medium focus:border-[#3483FA] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrorMsg(''); setSuccessMsg(''); }}
                    className="w-full bg-white border border-slate-300 rounded px-3 py-2 pr-9 text-xs font-medium focus:border-[#3483FA] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button 
                type="submit"
                disabled={!username.trim() || !password.trim() || !email.trim() || isLoading}
                className="w-full bg-[#3483FA] hover:bg-blue-600 disabled:bg-slate-300 text-white py-2 rounded text-xs font-bold transition-colors cursor-pointer"
              >
                {isLoading ? 'Criando...' : 'Criar Conta'}
              </button>
              <div className="pt-2 text-center">
                <button 
                  type="button" 
                  onClick={() => { setMode('login'); setStep(1); setErrorMsg(''); setSuccessMsg(''); setUsername(''); setPassword(''); }}
                  className="text-xs text-[#3483FA] hover:underline cursor-pointer"
                >
                  Voltar para o login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
