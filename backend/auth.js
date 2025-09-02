// backend/auth.js

function requireAuth(req, res, next) {
  if (req.session.user) {
    return next();
  }
  // Se não estiver autenticado, redireciona para a página de login
  return res.status(401).redirect('/login'); 
}

function requireRole(roles) {
  return (req, res, next) => {
    // Verifica se existe um utilizador na sessão e se o papel está na lista permitida
    if (req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }

    // Se o acesso for negado, redireciona para a página inicial ou de erro
    return res.status(403).redirect('/'); 
  };
}

module.exports = { requireAuth, requireRole };