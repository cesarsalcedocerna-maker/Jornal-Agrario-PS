/* =========================================================================
 * Jornal Agrario · Ley 31110 — cliente SPA (vanilla JS)
 * ========================================================================= */

const S = {
  usuario: null,
  datos: null,          // bootstrap
  vista: null,
  sim: null,            // último resultado de simulación
  simTimer: null,
  filtros: {},
  catalogo: 'puestos',
};

/* ------------------------------------------------------------- utilidades */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const nfMoney = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfNum = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const dinero = (valor) => `S/ ${nfMoney.format(Number(valor || 0))}`;
const n2 = (valor) => nfNum.format(Number(valor || 0));

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fechaLarga(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function fechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
}

const esc = (txt) => String(txt ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function toast(mensaje, tipo = '') {
  const cont = $('#toasts');
  if (!cont) return;
  const div = document.createElement('div');
  div.className = `toast ${tipo}`;
  div.textContent = mensaje;
  cont.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

/* -------------------------------------------------------------------- API */

async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const opciones = { method: metodo, headers: {}, credentials: 'same-origin' };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const res = await fetch(`/api${ruta}`, opciones);
  let datos = null;
  try {
    datos = await res.json();
  } catch {
    datos = null;
  }
  if (!res.ok) {
    const error = new Error((datos && datos.error) || `Error ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return datos;
}

/* ------------------------------------------------------------------ login */

const CLAVE_DEMO = 'agro2025';

function vistaLogin(rol = 'trabajador', error = '') {
  return `
  <div class="login-fondo">
    <section class="login-arte">
      <div>
        <div class="marca"><div class="logo">🌱</div> Jornal Agrario</div>
        <h1>Todo el detalle de tu jornal, al céntimo.</h1>
        <p class="bajada">Calculadora del régimen agrario (Ley 31110) para saber cuánto ganas hoy, esta semana y este mes — y hasta cuánto podrías ganar.</p>
        <ul>
          <li><span class="tick">✓</span> Jornal básico, horas extras por tramos y recargo nocturno</li>
          <li><span class="tick">✓</span> Metas y destajo por unidad producida</li>
          <li><span class="tick">✓</span> Feriados, tardanzas y descanso semanal remunerado</li>
          <li><span class="tick">✓</span> Aportes ONP/AFP, EsSalud y beneficios sociales</li>
          <li><span class="tick">✓</span> Gestión humana administra puestos, turnos, horarios y parámetros</li>
        </ul>
      </div>
      <p class="login-pie">Cálculos referenciales según parámetros configurados. No reemplaza la planilla oficial.</p>
    </section>

    <section class="login-panel">
      <div class="login-caja">
        <h2>Ingresar</h2>
        <p class="sub">Elige tu tipo de acceso para continuar.</p>

        ${error ? `<div class="aviso-error">${esc(error)}</div>` : ''}

        <div class="roles" role="group" aria-label="Tipo de acceso">
          <button type="button" class="rol-btn" data-rol="trabajador" aria-pressed="${rol === 'trabajador'}">
            <span class="rol-ico">👷</span>
            <span class="rol-nom">Trabajador</span>
            <span class="rol-desc">Simular y registrar mi jornal</span>
          </button>
          <button type="button" class="rol-btn" data-rol="gh" aria-pressed="${rol === 'gh'}">
            <span class="rol-ico">🏢</span>
            <span class="rol-nom">Gestión humana</span>
            <span class="rol-desc">Administrar y revisar</span>
          </button>
        </div>

        <form id="form-login" novalidate>
          <div class="campo">
            <label for="usuario">${rol === 'gh' ? 'Usuario' : 'DNI'}</label>
            <input id="usuario" name="usuario" autocomplete="username" required
              inputmode="${rol === 'gh' ? 'text' : 'numeric'}"
              placeholder="${rol === 'gh' ? 'gestion' : '45678912'}" />
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
          </div>
          <button class="btn bloque" type="submit" id="btn-login">Ingresar como ${rol === 'gh' ? 'gestión humana' : 'trabajador'}</button>
        </form>

        <div class="demo-hint">
          <b>Accesos de demostración:</b><br />
          ${rol === 'gh'
    ? 'Gestión humana · usuario <code>gestion</code> · clave <code>agro2025</code>'
    : 'Trabajador · DNI <code>45678912</code> · clave <code>agro2025</code>'}
        </div>
      </div>
    </section>
  </div>`;
}

function bindLogin() {
  let rol = 'trabajador';
  $$('.rol-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      rol = btn.dataset.rol;
      $('#app').innerHTML = vistaLogin(rol);
      bindLogin();
    });
  });
  const form = $('#form-login');
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const boton = $('#btn-login');
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
      const datos = await api('/auth/login', {
        metodo: 'POST',
        cuerpo: {
          usuario: $('#usuario').value.trim(),
          password: $('#password').value,
          rol,
        },
      });
      S.usuario = datos.usuario;
      await cargarBootstrap();
    } catch (error) {
      $('#app').innerHTML = vistaLogin(rol, error.message);
      bindLogin();
    }
  });
}

/* ------------------------------------------------------------------ shell */

const NAV = {
  trabajador: [
    { id: 'simulador', texto: 'Simulador' },
    { id: 'mis-jornales', texto: 'Mis jornales' },
  ],
  gh: [
    { id: 'resumen', texto: 'Resumen' },
    { id: 'trabajadores', texto: 'Trabajadores' },
    { id: 'registros', texto: 'Revisión' },
    { id: 'catalogos', texto: 'Catálogos' },
    { id: 'parametros', texto: 'Parámetros' },
  ],
};

function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase();
}

function shellHTML() {
  const items = NAV[S.usuario.rol] || [];
  return `
  <header class="topbar">
    <div class="marca">
      <div class="logo">🌱</div>
      <div>Jornal Agrario <small>Ley 31110 · régimen agrario</small></div>
    </div>
    <nav aria-label="Secciones">
      ${items.map((i) => `<button class="nav-btn" data-vista="${i.id}" aria-current="${S.vista === i.id ? 'page' : 'false'}">${i.texto}</button>`).join('')}
    </nav>
    <div class="usuario-chip">
      <div class="avatar">${esc(iniciales(S.usuario.nombre))}</div>
      <div class="datos">
        <b>${esc(S.usuario.nombre)}</b>
        <span>${S.usuario.rol === 'gh' ? 'Gestión humana' : `DNI ${esc(S.usuario.dni || '')}`}</span>
      </div>
      <button class="icono-btn" data-accion="logout" title="Salir" aria-label="Cerrar sesión">⎋</button>
    </div>
  </header>
  <main class="contenido" id="vista"></main>`;
}

function pintarShell() {
  $('#app').innerHTML = shellHTML();
  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      S.vista = btn.dataset.vista;
      S.filtros = {};
      pintarShell();
    });
  });
  renderVista();
}

async function cargarBootstrap() {
  S.datos = await api('/bootstrap');
  S.usuario = S.datos.usuario;
  S.vista = S.usuario.rol === 'gh' ? 'resumen' : 'simulador';
  pintarShell();
}

function renderVista() {
  const cont = $('#vista');
  const rol = S.usuario.rol;
  const mapa = rol === 'gh'
    ? { resumen: vistaResumenGH, trabajadores: vistaTrabajadoresGH, registros: vistaRegistrosGH, catalogos: vistaCatalogosGH, parametros: vistaParametrosGH }
    : { simulador: vistaSimulador, 'mis-jornales': vistaMisJornales };
  const fn = mapa[S.vista] || mapa[rol === 'gh' ? 'resumen' : 'simulador'];
  cont.innerHTML = '<div class="cargando">Cargando…</div>';
  fn(cont);
}

/* ======================================================== VISTAS TRABAJADOR */

function vistaSimulador(cont) {
  const { contexto } = S.datos;
  const t = contexto.trabajador;
  const metasPlan = contexto.puesto?.metasPlan || [];
  const hoy = S.datos.hoy;
  const feriadoHoy = (S.datos.feriados || []).find((f) => f.fecha === hoy);

  cont.innerHTML = `
  <div class="encabezado">
    <div>
      <h1>¿Cuánto voy a ganar?</h1>
      <p>Mueve tus horas, extras y metas para ver el detalle del pago del día, la semana y el mes.</p>
    </div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap">
      <span class="chip suave">${esc(contexto.puesto?.nombre || 'Sin puesto')}</span>
      <span class="chip">${esc(contexto.turno?.nombre || 'Sin turno')}</span>
      <span class="chip">Jornal ${dinero(t.tarifaJornal)}</span>
      <span class="chip">${n2(t.jornadaHoras)} h/día</span>
      <span class="chip">${n2(t.diasPorSemana)} días/sem</span>
    </div>
  </div>

  <div class="grid-2">
    <div class="tarjeta">
      <h3>Datos del día</h3>
      <form id="form-sim">
        <div class="campo">
          <label for="fecha">Fecha</label>
          <input type="date" id="fecha" name="fecha" value="${hoy}" />
          <div class="ayuda" id="aviso-fecha">${feriadoHoy ? `🎉 Feriado: ${esc(feriadoHoy.nombre)}` : ''}</div>
        </div>

        <div class="campo-fila">
          <div class="campo">
            <label for="horas">Horas ordinarias</label>
            <input type="number" id="horas" name="horas" min="0" max="16" step="0.5" value="${t.jornadaHoras}" />
          </div>
          <div class="campo">
            <label for="extras">Horas extra</label>
            <input type="number" id="extras" name="extras" min="0" max="12" step="0.5" value="0" />
            <div class="ayuda">Tope ${n2(contexto.config.maxHorasExtraDia)} h</div>
          </div>
        </div>

        <div class="campo-fila">
          <div class="campo">
            <label for="tardanza">Tardanza (min)</label>
            <input type="number" id="tardanza" name="tardanza" min="0" max="600" step="1" value="0" />
          </div>
          <div class="campo">
            <label for="descuento">Descuento (S/)</label>
            <input type="number" id="descuento" name="descuento" min="0" step="0.5" value="0" />
          </div>
        </div>

        <div class="campo">
          <label for="bonificacion">Bonificación adicional (S/)</label>
          <input type="number" id="bonificacion" name="bonificacion" min="0" step="0.5" value="0" />
        </div>

        <div class="campo">
          <label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
            <input type="checkbox" id="feriado" name="feriado" style="width:auto" ${feriadoHoy ? 'checked' : ''} />
            Trabajé en feriado
          </label>
        </div>
        <div class="campo">
          <label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
            <input type="checkbox" id="nocturno" name="nocturno" style="width:auto" ${contexto.turno?.nocturno ? 'checked' : ''} />
            Trabajo nocturno (+${n2((contexto.turno?.recargoPct ?? contexto.config.sobretasaNocturna) * 100)}%)
          </label>
        </div>

        ${metasPlan.length ? `
        <h3 style="margin:1.1rem 0 .5rem;font-size:.85rem">Metas / destajo</h3>
        ${metasPlan.map((m, i) => `
          <div class="campo">
            <label for="meta-${i}">${esc(m.nombre)} <span style="color:#64748b;font-weight:500">· ${dinero(m.tarifa)} / ${esc(m.unidad || 'und')}</span></label>
            <input type="number" id="meta-${i}" data-meta="${esc(m.nombre)}" data-unidad="${esc(m.unidad || 'und')}"
              min="0" step="1" value="${m.objetivoDia || 0}" />
            <div class="ayuda">Objetivo del día: ${n2(m.objetivoDia)} ${esc(m.unidad || 'und')}</div>
          </div>`).join('')}
        ` : '<p class="sub">Tu puesto no tiene metas configuradas.</p>'}

        <div style="display:flex;gap:.5rem;margin-top:1rem">
          <button class="btn bloque" type="submit">Calcular</button>
        </div>
        <button class="btn sec bloque" type="button" data-accion="guardar-jornal" style="margin-top:.5rem">Guardar jornal del día</button>
      </form>
    </div>

    <div class="pila" id="resultado"><div class="tarjeta"><div class="vacio">Presiona «Calcular» para ver tu detalle de pago.</div></div></div>
  </div>`;

  const form = $('#form-sim');
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    simular();
  });
  $$('#form-sim input').forEach((input) => {
    input.addEventListener('change', () => simular());
  });
  $('#fecha').addEventListener('change', () => {
    const f = $('#fecha').value;
    const fer = (S.datos.feriados || []).find((x) => x.fecha === f);
    $('#aviso-fecha').textContent = fer ? `🎉 Feriado: ${fer.nombre}` : '';
    $('#feriado').checked = !!fer;
  });

  simular();
}

function leerEntradaSim() {
  const horas = Number($('#horas').value || 0);
  const extras = Number($('#extras').value || 0);
  const metas = $$('[data-meta]')
    .map((input) => ({ nombre: input.dataset.meta, unidad: input.dataset.unidad, cantidad: Number(input.value || 0) }))
    .filter((m) => m.cantidad > 0);
  return {
    fecha: $('#fecha').value,
    horasTrabajadas: horas + extras,
    horasExtra: 0,
    metas,
    feriado: $('#feriado').checked,
    nocturno: $('#nocturno').checked,
    minutosTardanza: Number($('#tardanza').value || 0),
    bonificacion: Number($('#bonificacion').value || 0),
    descuento: Number($('#descuento').value || 0),
    diasPorSemana: S.datos.contexto.trabajador.diasPorSemana,
  };
}

async function simular() {
  const cont = $('#resultado');
  if (!cont) return;
  try {
    const resultado = await api('/simular', { metodo: 'POST', cuerpo: leerEntradaSim() });
    S.sim = resultado;
    cont.innerHTML = renderResultado(resultado);
  } catch (error) {
    cont.innerHTML = `<div class="tarjeta"><div class="aviso-error">${esc(error.message)}</div></div>`;
  }
}

function tarjetaPeriodo(clase, etiqueta, titulo, resumen, potencial) {
  return `
  <div class="periodo-card ${clase}">
    <div class="etiqueta">${etiqueta}</div>
    <div class="monto">${dinero(resumen.neto)} <small>neto</small></div>
    <div class="detalle-linea"><span>${titulo}</span><b>${dinero(resumen.bruto)} bruto</b></div>
    <div class="detalle-linea"><span>Ingresos del periodo</span><b>${dinero(resumen.ingresos.total ?? resumen.ingresos)}</b></div>
    <div class="detalle-linea"><span>Descuentos + aportes</span><b>− ${dinero(resumen.descuentos.total ?? resumen.totales.descuentos)}</b></div>
    <div class="potencial">Podrías llegar a <b>${dinero(potencial.neto)}</b><br /><span style="color:#64748b">${esc(potencial.supuestos)}</span></div>
  </div>`;
}

function renderResultado(r) {
  const dia = r.dia;
  const semana = r.semana;
  const mes = r.mes;
  const cfg = r.contexto?.config || {};

  const diaNormalizado = {
    bruto: dia.totales.bruto,
    neto: dia.totales.bruto,
    ingresos: { total: dia.totales.ingresos },
    descuentos: { total: dia.totales.descuentos },
  };

  const filasDia = dia.conceptos.map((c) => `
    <tr class="${c.tipo === 'descuento' ? 'descuento' : ''}">
      <td>
        <div>${esc(c.descripcion)}</div>
        ${c.detalle ? `<div class="det">${esc(c.detalle)}</div>` : ''}
      </td>
      <td class="num">${c.cantidad != null ? `${n2(c.cantidad)} ${esc(c.unidad || '')}` : ''}</td>
      <td class="num">${c.precio != null ? dinero(c.precio) : ''}</td>
      <td class="num">${c.tipo === 'descuento' ? '−' : ''}${dinero(c.monto)}</td>
    </tr>`).join('');

  const ingresosMes = [
    ['Jornal básico', mes.ingresos.jornal],
    ['Horas extras', mes.ingresos.horasExtra],
    ['Recargo nocturno', mes.ingresos.nocturno],
    ['Feriados trabajados', mes.ingresos.feriados],
    ['Metas / destajo', mes.ingresos.metas],
    ['Bonos', mes.ingresos.bonos],
    ['Descanso semanal', mes.ingresos.descansoSemanal],
    ['Asignación familiar', mes.ingresos.asignacionFamiliar],
  ].filter(([, valor]) => Number(valor) > 0);

  return `
  <div class="resumen-cards">
    ${tarjetaPeriodo('', 'Hoy', esc(r.dia.dia), diaNormalizado, { neto: r.potencial.dia.neto, supuestos: r.potencial.dia.supuestos })}
    ${tarjetaPeriodo('semana', 'Semana', `${semana.periodo.diasTrabajados} días laborados`, semana, { neto: r.potencial.semana.neto, supuestos: r.potencial.semana.supuestos })}
    ${tarjetaPeriodo('mes', 'Mes', `${mes.periodo.diasTrabajados} días laborados`, mes, { neto: r.potencial.mes.neto, supuestos: r.potencial.mes.supuestos })}
  </div>

  ${dia.avisos.length ? dia.avisos.map((a) => `<div class="aviso">⚠️ ${esc(a)}</div>`).join('') : ''}

  <div class="tarjeta" style="margin-bottom:1.25rem">
    <h3>Detalle del día · ${fechaLarga(dia.fecha)}</h3>
    <div class="tabla-wrap">
      <table class="desglose-tabla">
        <thead>
          <tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Monto</th></tr>
        </thead>
        <tbody>${filasDia}</tbody>
        <tfoot>
          <tr class="total"><td colspan="3">Total ingresos</td><td class="num">${dinero(dia.totales.ingresos)}</td></tr>
          ${dia.totales.descuentos > 0 ? `<tr class="descuento"><td colspan="3">Descuentos del día</td><td class="num">− ${dinero(dia.totales.descuentos)}</td></tr>` : ''}
          <tr class="total"><td colspan="3">Bruto del día</td><td class="num">${dinero(dia.totales.bruto)}</td></tr>
        </tfoot>
      </table>
    </div>
    <p class="nota-legal" style="margin-top:.6rem">
      Horas: ${n2(dia.horas.ordinarias)} ordinarias + ${n2(dia.horas.extra)} extra
      (${n2(dia.horas.extraTramo1)} al +${n2(cfg.sobretasaExtra1 * 100)}% y ${n2(dia.horas.extraTramo2)} al +${n2(cfg.sobretasaExtra2 * 100)}%).
      Valor hora: ${dinero(dia.tarifas.hora)}. Los aportes previsionales se descuentan en el consolidado semanal y mensual.
    </p>
  </div>

  <div class="grid-2">
    <div class="tarjeta">
      <h3>Composición del mes</h3>
      <table class="desglose-tabla">
        <tbody>
          ${ingresosMes.map(([et, v]) => `<tr><td>${et}</td><td class="num">${dinero(v)}</td></tr>`).join('')}
          <tr class="total"><td>Total ingresos</td><td class="num">${dinero(mes.ingresos.total)}</td></tr>
          ${mes.descuentos.dia > 0 ? `<tr class="descuento"><td>Descuentos del día</td><td class="num">− ${dinero(mes.descuentos.dia)}</td></tr>` : ''}
          <tr><td>Bruto afecto</td><td class="num">${dinero(mes.bruto)}</td></tr>
          ${mes.aportes.detalle.map((d) => `<tr class="descuento"><td>${esc(d.descripcion)}</td><td class="num">− ${dinero(d.monto)}</td></tr>`).join('')}
          <tr class="total"><td>Neto a cobrar</td><td class="num">${dinero(mes.neto)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="tarjeta">
      <h3>Beneficios y costo del empleador (mes)</h3>
      <table class="desglose-tabla">
        <tbody>
          ${mes.beneficios.detalle.length
    ? mes.beneficios.detalle.map((d) => `<tr><td>${esc(d.descripcion)}</td><td class="num">${dinero(d.monto)}</td></tr>`).join('')
    : `<tr><td colspan="2" class="det">Esquema ${esc(mes.beneficios.esquema)}: los beneficios ya están incluidos en el jornal.</td></tr>`}
          <tr><td>EsSalud (${n2(cfg.essaludPct * 100)}%)</td><td class="num">${dinero(mes.costoEmpleador.essalud)}</td></tr>
          <tr class="total"><td>Costo total para la empresa</td><td class="num">${dinero(mes.costoEmpleador.total)}</td></tr>
        </tbody>
      </table>
      <p class="nota-legal" style="margin-top:.6rem">
        Esquema de beneficios: <b>${esc(mes.beneficios.esquema)}</b> · Semana de ${n2(r.parametros.diasPorSemana)} días · ${n2(r.parametros.semanasPorMes)} semanas por mes.
      </p>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- mis jornales  */

function vistaMisJornales(cont) {
  const registros = S.datos.registros || [];
  const totales = registros.reduce((acc, r) => {
    acc.bruto += r.calculo.totales.bruto;
    acc.ingresos += r.calculo.totales.ingresos;
    acc.horas += r.calculo.horas.trabajadas;
    acc.extra += r.calculo.horas.extra;
    return acc;
  }, { bruto: 0, ingresos: 0, horas: 0, extra: 0 });

  cont.innerHTML = `
  <div class="encabezado">
    <div>
      <h1>Mis jornales</h1>
      <p>Historial de los días que registraste y el estado de revisión de Gestión Humana.</p>
    </div>
    <button class="btn" data-vista="simulador">+ Registrar nuevo día</button>
  </div>

  <div class="grid-4" style="margin-bottom:1.25rem">
    <div class="metrica"><div class="et">Días registrados</div><div class="val">${registros.length}</div></div>
    <div class="metrica"><div class="et">Horas trabajadas</div><div class="val">${n2(totales.horas)}</div><div class="nota">${n2(totales.extra)} h extra</div></div>
    <div class="metrica"><div class="et">Bruto acumulado</div><div class="val">${dinero(totales.bruto)}</div></div>
    <div class="metrica"><div class="et">Aprobados</div><div class="val">${registros.filter((r) => r.estado === 'aprobado').length}</div><div class="nota">${registros.filter((r) => r.estado === 'observado').length} observados</div></div>
  </div>

  <div class="tarjeta">
    ${registros.length ? `
    <div class="tabla-wrap">
      <table class="tabla">
        <thead>
          <tr>
            <th>Fecha</th><th>Día</th><th class="num">Horas</th><th class="num">Extra</th>
            <th class="num">Ingresos</th><th class="num">Bruto</th><th>Estado</th><th>Comentario GH</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map((r) => `
            <tr>
              <td>${fechaCorta(r.fecha)}</td>
              <td>${esc(r.calculo.dia)}</td>
              <td class="num">${n2(r.calculo.horas.trabajadas)}</td>
              <td class="num">${n2(r.calculo.horas.extra)}</td>
              <td class="num">${dinero(r.calculo.totales.ingresos)}</td>
              <td class="num">${dinero(r.calculo.totales.bruto)}</td>
              <td><span class="chip ${esc(r.estado)}">${esc(r.estado)}</span></td>
              <td class="det">${esc(r.comentarioGH || '—')}</td>
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="2">TOTAL</td><td class="num">${n2(totales.horas)}</td><td class="num">${n2(totales.extra)}</td><td class="num">${dinero(totales.ingresos)}</td><td class="num">${dinero(totales.bruto)}</td><td colspan="2"></td></tr>
        </tfoot>
      </table>
    </div>` : '<div class="vacio">Aún no registraste jornales. Usa el simulador y guarda tu día.</div>'}
  </div>`;

  $$('[data-vista]', cont).forEach((btn) => btn.addEventListener('click', () => {
    S.vista = btn.dataset.vista;
    pintarShell();
  }));
}

/* ========================================================== VISTAS GH      */

async function vistaResumenGH(cont) {
  try {
    const r = await api('/reportes/resumen');
    const top = Object.entries(r.porPuesto || {}).sort((a, b) => b[1] - a[1]);
    const max = top.length ? top[0][1] : 0;
    cont.innerHTML = `
    <div class="encabezado">
      <div>
        <h1>Resumen de planilla</h1>
        <p>Periodo ${fechaLarga(r.periodo.desde)} — ${fechaLarga(r.periodo.hasta)}</p>
      </div>
      <button class="btn sec" data-accion="ir-registros">Revisar pendientes (${r.registrosPendientes})</button>
    </div>

    <div class="grid-4" style="margin-bottom:1.25rem">
      <div class="metrica"><div class="et">Trabajadores activos</div><div class="val">${r.trabajadoresActivos}</div></div>
      <div class="metrica"><div class="et">Jornales pendientes</div><div class="val">${r.registrosPendientes}</div><div class="nota">${r.registrosObservados} observados</div></div>
      <div class="metrica"><div class="et">Neto del mes</div><div class="val">${dinero(r.planillaMes.neto || 0)}</div><div class="nota">${dinero(r.planillaMes.bruto || 0)} bruto</div></div>
      <div class="metrica"><div class="et">Costo total</div><div class="val">${dinero(r.planillaMes.costoTotal || 0)}</div><div class="nota">EsSalud ${dinero(r.planillaMes.essalud || 0)}</div></div>
    </div>

    <div class="grid-2">
      <div class="tarjeta">
        <h3>Costo laboral por puesto</h3>
        ${top.length ? top.map(([puesto, monto]) => `
          <div style="margin-bottom:.7rem">
            <div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:.25rem">
              <span>${esc(puesto)}</span><b>${dinero(monto)}</b>
            </div>
            <div class="barra"><i style="width:${max ? Math.round((monto / max) * 100) : 0}%"></i></div>
          </div>`).join('') : '<div class="vacio">Sin jornales registrados en el mes.</div>'}
      </div>

      <div class="tarjeta">
        <h3>Estado de la planilla del mes</h3>
        <table class="desglose-tabla">
          <tbody>
            <tr><td>Días trabajados</td><td class="num">${n2(r.planillaMes.dias || 0)}</td></tr>
            <tr><td>Horas trabajadas</td><td class="num">${n2(r.planillaMes.horas || 0)}</td></tr>
            <tr><td>Horas extra</td><td class="num">${n2(r.planillaMes.extra || 0)}</td></tr>
            <tr><td>Jornal básico</td><td class="num">${dinero(r.planillaMes.jornal || 0)}</td></tr>
            <tr><td>Horas extra S/</td><td class="num">${dinero(r.planillaMes.horasExtra || 0)}</td></tr>
            <tr><td>Metas S/</td><td class="num">${dinero(r.planillaMes.metas || 0)}</td></tr>
            <tr><td>Aportes previsionales</td><td class="num">− ${dinero(r.planillaMes.pension || 0)}</td></tr>
            <tr class="total"><td>Neto a pagar</td><td class="num">${dinero(r.planillaMes.neto || 0)}</td></tr>
          </tbody>
        </table>
        <p class="nota-legal" style="margin-top:.6rem">
          Jornales aprobados: ${r.registrosAprobados} · Esquema de beneficios: ${esc(r.esquemaBeneficios)} · Feriados cargados: ${r.feriadosRegistrados}
        </p>
      </div>
    </div>`;
    const irBtn = $('[data-accion="ir-registros"]', cont);
    if (irBtn) irBtn.addEventListener('click', () => { S.vista = 'registros'; pintarShell(); });
  } catch (error) {
    cont.innerHTML = `<div class="aviso-error">${esc(error.message)}</div>`;
  }
}

/* --------------------------------------------------------- trabajadores   */

async function vistaTrabajadoresGH(cont) {
  const { puestos, turnos, horarios, modalidades } = S.datos;
  try {
    const { items } = await api('/trabajadores');
    cont.innerHTML = `
    <div class="encabezado">
      <div><h1>Trabajadores</h1><p>Asigna puesto, turno, horario, modalidad y tarifa del jornal.</p></div>
      <button class="btn" data-accion="nuevo-trabajador">+ Nuevo trabajador</button>
    </div>

    <div class="tarjeta">
      <div class="tabla-wrap">
        <table class="tabla">
          <thead>
            <tr><th>Trabajador</th><th>DNI</th><th>Puesto</th><th>Turno</th><th>Horario</th><th>Modalidad</th>
            <th class="num">Jornal</th><th class="num">Jornada</th><th class="num">Días/sem</th><th>Pensión</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${items.map((t) => `
              <tr>
                <td><b>${esc(t.nombres)} ${esc(t.apellidos)}</b>${t.asignacionFamiliar ? ' <span class="chip suave">Asig. familiar</span>' : ''}</td>
                <td>${esc(t.dni)}</td>
                <td>${esc(t.puesto || '—')}</td>
                <td>${esc(t.turno || '—')}</td>
                <td>${esc(t.horario || '—')}</td>
                <td>${esc(t.modalidad || '—')}</td>
                <td class="num">${dinero(t.tarifaJornal)}</td>
                <td class="num">${n2(t.jornadaHoras)}</td>
                <td class="num">${n2(t.diasPorSemana)}</td>
                <td>${esc(t.sistemaPension || 'ONP')}</td>
                <td><span class="chip ${t.activo ? 'activo' : 'inactivo'}">${t.activo ? 'activo' : 'inactivo'}</span></td>
                <td class="acciones"><button class="btn mini sec" data-accion="editar-trabajador" data-id="${t.id}">Editar</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${items.length ? '' : '<div class="vacio">Aún no hay trabajadores registrados.</div>'}
    </div>`;

    $$('[data-accion="editar-trabajador"]', cont).forEach((btn) => btn.addEventListener('click', () => {
      const t = items.find((x) => x.id === btn.dataset.id);
      formularioTrabajador(t);
    }));
    $('[data-accion="nuevo-trabajador"]', cont).addEventListener('click', () => formularioTrabajador(null));
  } catch (error) {
    cont.innerHTML = `<div class="aviso-error">${esc(error.message)}</div>`;
  }
}

function formularioTrabajador(trabajador) {
  const { puestos, turnos, horarios, modalidades } = S.datos;
  const t = trabajador || {};
  const campo = (label, input) => `<div class="campo"><label>${label}</label>${input}</div>`;
  const opciones = (lista, valor, vacio = '— Sin asignar —') => `
    <option value="">${vacio}</option>
    ${lista.map((i) => `<option value="${i.id}" ${i.id === valor ? 'selected' : ''}>${esc(i.nombre)}</option>`).join('')}`;

  abrirModal({
    titulo: trabajador ? `Editar ${esc(t.nombres)} ${esc(t.apellidos)}` : 'Nuevo trabajador',
    cuerpo: `
      <div class="campo-fila">
        ${campo('Nombres', `<input id="f-nombres" value="${esc(t.nombres || '')}" />`)}
        ${campo('Apellidos', `<input id="f-apellidos" value="${esc(t.apellidos || '')}" />`)}
      </div>
      <div class="campo-fila">
        ${campo('DNI', `<input id="f-dni" inputmode="numeric" value="${esc(t.dni || '')}" ${trabajador ? 'disabled' : ''} />`)}
        ${campo('Teléfono', `<input id="f-telefono" value="${esc(t.telefono || '')}" />`)}
      </div>
      ${campo('Email', `<input id="f-email" type="email" value="${esc(t.email || '')}" />`)}
      <div class="campo-fila">
        ${campo('Puesto', `<select id="f-puesto">${opciones(puestos, t.puestoId)}</select>`)}
        ${campo('Modalidad', `<select id="f-modalidad">${opciones(modalidades, t.modalidadId)}</select>`)}
      </div>
      <div class="campo-fila">
        ${campo('Turno', `<select id="f-turno">${opciones(turnos, t.turnoId)}</select>`)}
        ${campo('Horario', `<select id="f-horario">${opciones(horarios, t.horarioId)}</select>`)}
      </div>
      <div class="campo-fila">
        ${campo('Tarifa del jornal (S/)', `<input id="f-tarifa" type="number" min="0" step="0.5" value="${t.tarifaJornal ?? 60}" />`)}
        ${campo('Jornada diaria (h)', `<input id="f-jornada" type="number" min="1" max="12" step="0.5" value="${t.jornadaHoras ?? 8}" />`)}
      </div>
      <div class="campo-fila">
        ${campo('Días por semana', `<input id="f-dias" type="number" min="1" max="7" step="1" value="${t.diasPorSemana ?? 6}" />`)}
        ${campo('Sistema de pensión', `<select id="f-pension">
          ${['ONP', 'AFP', 'SIN_APORTE'].map((s) => `<option value="${s}" ${s === (t.sistemaPension || 'ONP') ? 'selected' : ''}>${s}</option>`).join('')}
        </select>`)}
      </div>
      <div class="campo-fila">
        ${campo('Fecha de ingreso', `<input id="f-ingreso" type="date" value="${esc(t.fechaIngreso || S.datos.hoy)}" />`)}
        ${campo('Contraseña de acceso', `<input id="f-password" type="text" placeholder="${trabajador ? 'Sin cambios' : CLAVE_DEMO}" />`)}
      </div>
      <div class="campo">
        <label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
          <input type="checkbox" id="f-asignacion" style="width:auto" ${t.asignacionFamiliar ? 'checked' : ''} /> Recibe asignación familiar (10% RMV)
        </label>
      </div>
      <div class="campo">
        <label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
          <input type="checkbox" id="f-activo" style="width:auto" ${t.activo !== false ? 'checked' : ''} /> Trabajador activo
        </label>
      </div>
      <p class="nota-legal">El acceso del trabajador se crea automáticamente usando su DNI como usuario.</p>`,
    textoGuardar: trabajador ? 'Guardar cambios' : 'Crear trabajador',
    onGuardar: async () => {
      const cuerpo = {
        nombres: $('#f-nombres').value.trim(),
        apellidos: $('#f-apellidos').value.trim(),
        telefono: $('#f-telefono').value.trim(),
        email: $('#f-email').value.trim(),
        puestoId: $('#f-puesto').value || null,
        modalidadId: $('#f-modalidad').value || null,
        turnoId: $('#f-turno').value || null,
        horarioId: $('#f-horario').value || null,
        tarifaJornal: Number($('#f-tarifa').value || 0),
        jornadaHoras: Number($('#f-jornada').value || 8),
        diasPorSemana: Number($('#f-dias').value || 6),
        sistemaPension: $('#f-pension').value,
        fechaIngreso: $('#f-ingreso').value,
        asignacionFamiliar: $('#f-asignacion').checked,
        activo: $('#f-activo').checked,
      };
      const clave = $('#f-password').value.trim();
      if (clave) cuerpo.password = clave;
      if (trabajador) await api(`/trabajadores/${trabajador.id}`, { metodo: 'PUT', cuerpo });
      else {
        cuerpo.dni = $('#f-dni').value.trim();
        await api('/trabajadores', { metodo: 'POST', cuerpo });
      }
      toast(trabajador ? 'Trabajador actualizado.' : 'Trabajador creado.', 'ok');
    },
  });
}

/* -------------------------------------------------------------- registros */

async function vistaRegistrosGH(cont) {
  const { trabajadores } = S.datos;
  if (!S.filtros.registros) S.filtros.registros = { estado: 'enviado', desde: '', hasta: '' };
  const f = S.filtros.registros;

  const query = new URLSearchParams();
  if (f.estado) query.set('estado', f.estado);
  if (f.desde) query.set('desde', f.desde);
  if (f.hasta) query.set('hasta', f.hasta);

  try {
    const { items } = await api(`/registros?${query.toString()}`);
    const total = items.reduce((s, r) => s + r.calculo.totales.bruto, 0);

    cont.innerHTML = `
    <div class="encabezado">
      <div><h1>Revisión de jornales</h1><p>Verifica, corrige y aprueba los días declarados por los trabajadores.</p></div>
    </div>

    <div class="tarjeta">
      <div class="barra-filtros">
        <div class="campo">
          <label>Estado</label>
          <select id="f-estado">
            <option value="">Todos</option>
            ${['borrador', 'enviado', 'aprobado', 'observado'].map((e) => `<option value="${e}" ${f.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="campo"><label>Desde</label><input type="date" id="f-desde" value="${f.desde}" /></div>
        <div class="campo"><label>Hasta</label><input type="date" id="f-hasta" value="${f.hasta}" /></div>
        <button class="btn sec" data-accion="filtrar">Filtrar</button>
        <button class="btn ghost" data-accion="limpiar-filtro">Limpiar</button>
      </div>

      ${items.length ? `
      <div class="tabla-wrap">
        <table class="tabla">
          <thead>
            <tr><th>Fecha</th><th>Trabajador</th><th>Puesto</th><th class="num">Horas</th><th class="num">Extra</th>
            <th class="num">Metas</th><th class="num">Bruto</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${items.map((r) => `
              <tr>
                <td>${fechaCorta(r.fecha)}<br /><span class="det">${esc(r.calculo.dia)}</span></td>
                <td><b>${esc(r.trabajador.nombre)}</b><br /><span class="det">DNI ${esc(r.trabajador.dni)}</span></td>
                <td>${esc(r.trabajador.puesto || '—')}</td>
                <td class="num">${n2(r.calculo.horas.trabajadas)}</td>
                <td class="num">${n2(r.calculo.horas.extra)}</td>
                <td class="num">${dinero(r.calculo.conceptos.filter((c) => c.codigo.startsWith('meta:')).reduce((s, c) => s + c.monto, 0))}</td>
                <td class="num">${dinero(r.calculo.totales.bruto)}</td>
                <td><span class="chip ${esc(r.estado)}">${esc(r.estado)}</span></td>
                <td class="acciones">
                  <button class="btn mini sec" data-accion="ver-registro" data-id="${r.id}">Detalle</button>
                  ${r.estado !== 'aprobado' ? `<button class="btn mini" data-accion="aprobar" data-id="${r.id}">Aprobar</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot><tr><td colspan="6">TOTAL (${items.length} jornales)</td><td class="num">${dinero(total)}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>` : '<div class="vacio">No hay jornales con ese filtro.</div>'}
    </div>`;

    $('[data-accion="filtrar"]', cont).addEventListener('click', () => {
      S.filtros.registros = {
        estado: $('#f-estado').value,
        desde: $('#f-desde').value,
        hasta: $('#f-hasta').value,
      };
      renderVista();
    });
    $('[data-accion="limpiar-filtro"]', cont).addEventListener('click', () => {
      S.filtros.registros = { estado: '', desde: '', hasta: '' };
      renderVista();
    });
    $$('[data-accion="ver-registro"]', cont).forEach((b) => b.addEventListener('click', () => {
      modalRegistro(items.find((x) => x.id === b.dataset.id));
    }));
    $$('[data-accion="aprobar"]', cont).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api(`/registros/${b.dataset.id}`, { metodo: 'PUT', cuerpo: { estado: 'aprobado' } });
        toast('Jornal aprobado.', 'ok');
        renderVista();
      } catch (error) {
        toast(error.message, 'error');
        b.disabled = false;
      }
    }));
  } catch (error) {
    cont.innerHTML = `<div class="aviso-error">${esc(error.message)}</div>`;
  }
}

function modalRegistro(registro) {
  const c = registro.calculo;
  const metaActual = (c.conceptos.find((x) => x.codigo.startsWith('meta:')) || {});
  abrirModal({
    titulo: `Jornal del ${fechaLarga(registro.fecha)} · ${registro.trabajador.nombre}`,
    cuerpo: `
      <div class="tabla-wrap" style="margin-bottom:1rem">
        <table class="desglose-tabla">
          <thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Monto</th></tr></thead>
          <tbody>
            ${c.conceptos.map((x) => `<tr class="${x.tipo === 'descuento' ? 'descuento' : ''}">
              <td>${esc(x.descripcion)}${x.detalle ? `<div class="det">${esc(x.detalle)}</div>` : ''}</td>
              <td class="num">${x.cantidad != null ? n2(x.cantidad) : ''}</td>
              <td class="num">${x.tipo === 'descuento' ? '−' : ''}${dinero(x.monto)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr class="total"><td>Bruto del día</td><td></td><td class="num">${dinero(c.totales.bruto)}</td></tr></tfoot>
        </table>
      </div>
      ${c.avisos.length ? c.avisos.map((a) => `<div class="aviso">⚠️ ${esc(a)}</div>`).join('') : ''}

      <div class="campo-fila">
        <div class="campo"><label>Horas trabajadas</label><input type="number" id="r-horas" min="0" max="24" step="0.5" value="${c.horas.trabajadas}" /></div>
        <div class="campo"><label>Minutos de tardanza</label><input type="number" id="r-tardanza" min="0" step="1" value="${c.horas.minutosTardanza}" /></div>
      </div>
      <div class="campo-fila">
        <div class="campo"><label>Bonificación (S/)</label><input type="number" id="r-bono" min="0" step="0.5" value="${registro.bonificacion || 0}" /></div>
        <div class="campo"><label>Descuento (S/)</label><input type="number" id="r-descuento" min="0" step="0.5" value="${registro.descuento || 0}" /></div>
      </div>
      ${metaActual.codigo ? `
      <div class="campo">
        <label>Cantidad de meta (${esc(metaActual.descripcion)})</label>
        <input type="number" id="r-meta" min="0" step="1" value="${metaActual.cantidad || 0}" />
      </div>` : ''}
      <div class="campo">
        <label>Estado</label>
        <select id="r-estado">
          ${['borrador', 'enviado', 'aprobado', 'observado'].map((e) => `<option value="${e}" ${registro.estado === e ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="campo">
        <label>Comentario para el trabajador</label>
        <textarea id="r-comentario" rows="2">${esc(registro.comentarioGH || '')}</textarea>
      </div>
      <p class="nota-legal">Al guardar, el jornal se recalcula con los parámetros vigentes y el trabajador verá el nuevo resultado.</p>`,
    textoGuardar: 'Guardar revisión',
    onGuardar: async () => {
      const cuerpo = {
        estado: $('#r-estado').value,
        comentarioGH: $('#r-comentario').value,
        horasTrabajadas: Number($('#r-horas').value || 0),
        minutosTardanza: Number($('#r-tardanza').value || 0),
        bonificacion: Number($('#r-bono').value || 0),
        descuento: Number($('#r-descuento').value || 0),
      };
      if ($('#r-meta')) cuerpo.metas = [{ nombre: metaActual.descripcion.replace(/^Meta:\s*/, ''), cantidad: Number($('#r-meta').value || 0) }];
      await api(`/registros/${registro.id}`, { metodo: 'PUT', cuerpo });
      toast('Revisión guardada.', 'ok');
    },
  });
}

/* -------------------------------------------------------------- catálogos */

const DEF_CATALOGOS = {
  puestos: {
    titulo: 'Puestos de trabajo',
    campos: [
      { name: 'nombre', label: 'Nombre del puesto', tipo: 'text' },
      { name: 'area', label: 'Área', tipo: 'text' },
      { name: 'tarifaJornal', label: 'Tarifa del jornal (S/)', tipo: 'number', step: '0.5' },
      { name: 'jornadaHoras', label: 'Jornada (h)', tipo: 'number', step: '0.5' },
      { name: 'descripcion', label: 'Descripción', tipo: 'text' },
    ],
    metas: true,
    columnas: [
      { k: 'nombre', t: 'Puesto' },
      { k: 'area', t: 'Área' },
      { k: 'tarifaJornal', t: 'Jornal', money: true },
      { k: 'jornadaHoras', t: 'Jornada' },
    ],
  },
  turnos: {
    titulo: 'Turnos',
    campos: [
      { name: 'nombre', label: 'Nombre', tipo: 'text' },
      { name: 'horaInicio', label: 'Hora inicio', tipo: 'time' },
      { name: 'horaFin', label: 'Hora fin', tipo: 'time' },
      { name: 'recargoPct', label: 'Recargo nocturno (0.35 = 35%)', tipo: 'number', step: '0.01' },
      { name: 'refrigerioMinutos', label: 'Refrigerio (min)', tipo: 'number', step: '5' },
      { name: 'nocturno', label: 'Es turno nocturno', tipo: 'checkbox' },
    ],
    columnas: [
      { k: 'nombre', t: 'Turno' },
      { k: 'horaInicio', t: 'Inicio' },
      { k: 'horaFin', t: 'Fin' },
      { k: 'recargoPct', t: 'Recargo', pct: true },
      { k: 'nocturno', t: 'Nocturno', bool: true },
    ],
  },
  horarios: {
    titulo: 'Horarios de trabajo',
    campos: [
      { name: 'nombre', label: 'Nombre', tipo: 'text' },
      { name: 'horaEntrada', label: 'Hora de entrada', tipo: 'time' },
      { name: 'horaSalida', label: 'Hora de salida', tipo: 'time' },
      { name: 'refrigerioMinutos', label: 'Refrigerio (min)', tipo: 'number', step: '5' },
      { name: 'toleranciaMinutos', label: 'Tolerancia (min)', tipo: 'number', step: '5' },
      { name: 'dias', label: 'Días de la semana', tipo: 'dias' },
    ],
    columnas: [
      { k: 'nombre', t: 'Horario' },
      { k: 'horaEntrada', t: 'Entrada' },
      { k: 'horaSalida', t: 'Salida' },
      { k: 'dias', t: 'Días', dias: true },
    ],
  },
  modalidades: {
    titulo: 'Modalidades de trabajo',
    campos: [
      { name: 'nombre', label: 'Nombre', tipo: 'text' },
      { name: 'descripcion', label: 'Descripción', tipo: 'text' },
      { name: 'diasPorSemana', label: 'Días por semana', tipo: 'number', step: '1' },
      { name: 'aplicaBeneficios', label: 'Aplica beneficios sociales', tipo: 'checkbox' },
    ],
    columnas: [
      { k: 'nombre', t: 'Modalidad' },
      { k: 'diasPorSemana', t: 'Días/sem' },
      { k: 'aplicaBeneficios', t: 'Beneficios', bool: true },
    ],
  },
};

async function vistaCatalogosGH(cont) {
  const cat = S.catalogo;
  const def = DEF_CATALOGOS[cat];
  try {
    const { items } = await api(`/${cat}`);
    const celda = (item, col) => {
      const v = item[col.k];
      if (col.money) return dinero(v);
      if (col.pct) return `${n2((v || 0) * 100)}%`;
      if (col.bool) return v ? 'Sí' : 'No';
      if (col.dias) return Array.isArray(v) ? `${v.length} días` : '—';
      return esc(v ?? '—');
    };

    cont.innerHTML = `
    <div class="encabezado">
      <div><h1>Catálogos</h1><p>Puestos, turnos, horarios y modalidades que usa el motor de cálculo.</p></div>
      <button class="btn" data-accion="nuevo-item">+ Nuevo</button>
    </div>

    <div class="tabs-internas" role="tablist">
      ${Object.entries(DEF_CATALOGOS).map(([k, d]) => `
        <button class="tab-btn" role="tab" data-tab="${k}" aria-selected="${k === cat}">${d.titulo}</button>`).join('')}
    </div>

    <div class="tarjeta">
      <h3>${def.titulo}</h3>
      ${items.length ? `
      <div class="tabla-wrap">
        <table class="tabla">
          <thead><tr>${def.columnas.map((c) => `<th class="${['tarifaJornal', 'jornadaHoras', 'diasPorSemana', 'recargoPct'].includes(c.k) ? 'num' : ''}">${c.t}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                ${def.columnas.map((c) => `<td class="${['tarifaJornal', 'jornadaHoras', 'diasPorSemana', 'recargoPct'].includes(c.k) ? 'num' : ''}">${celda(item, c)}</td>`).join('')}
                <td class="acciones">
                  <button class="btn mini sec" data-accion="editar-item" data-id="${item.id}">Editar</button>
                  <button class="btn mini ghost" data-accion="borrar-item" data-id="${item.id}">Eliminar</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="vacio">Sin registros.</div>'}
    </div>`;

    $$('[data-tab]', cont).forEach((b) => b.addEventListener('click', () => {
      S.catalogo = b.dataset.tab;
      renderVista();
    }));
    $('[data-accion="nuevo-item"]', cont).addEventListener('click', () => modalCatalogo(cat, null));
    $$('[data-accion="editar-item"]', cont).forEach((b) => b.addEventListener('click', () => {
      modalCatalogo(cat, items.find((x) => x.id === b.dataset.id));
    }));
    $$('[data-accion="borrar-item"]', cont).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
      try {
        await api(`/${cat}/${b.dataset.id}`, { metodo: 'DELETE' });
        toast('Eliminado.', 'ok');
        renderVista();
      } catch (error) {
        toast(error.message, 'error');
      }
    }));
  } catch (error) {
    cont.innerHTML = `<div class="aviso-error">${esc(error.message)}</div>`;
  }
}

function modalCatalogo(cat, item) {
  const def = DEF_CATALOGOS[cat];
  const valor = item || {};
  const inputCampo = (c) => {
    if (c.tipo === 'checkbox') {
      return `<label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
        <input type="checkbox" id="c-${c.name}" style="width:auto" ${valor[c.name] ? 'checked' : ''} /> ${c.label}</label>`;
    }
    if (c.tipo === 'time') {
      return `<input type="time" id="c-${c.name}" value="${esc(valor[c.name] || '08:00')}" />`;
    }
    if (c.tipo === 'dias') {
      const activos = Array.isArray(valor[c.name]) ? valor[c.name] : ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return `<div style="display:flex;gap:.6rem;flex-wrap:wrap">
        ${DIAS.slice(1).concat('domingo').map((d) => `
          <label style="display:flex;gap:.25rem;align-items:center;font-weight:500;font-size:.8rem">
            <input type="checkbox" class="c-dia" value="${d}" style="width:auto" ${activos.includes(d) ? 'checked' : ''} />${d.slice(0, 3)}
          </label>`).join('')}
      </div>`;
    }
    if (c.tipo === 'number') {
      return `<input type="number" id="c-${c.name}" step="${c.step || '1'}" value="${valor[c.name] ?? 0}" />`;
    }
    return `<input id="c-${c.name}" value="${esc(valor[c.name] || '')}" />`;
  };

  const metasPlan = Array.isArray(valor.metasPlan) && valor.metasPlan.length
    ? valor.metasPlan
    : [{ nombre: '', unidad: 'und', tarifa: 0, objetivoDia: 0 }];

  abrirModal({
    titulo: `${item ? 'Editar' : 'Nuevo'} · ${def.titulo}`,
    cuerpo: `
      ${def.campos.map((c) => `<div class="campo"><label>${c.label}</label>${inputCampo(c)}</div>`).join('')}
      ${def.metas ? `
        <h4 style="font-size:.85rem;margin:.6rem 0 .4rem">Plan de metas del puesto</h4>
        <div class="metas-editor" id="metas-editor">
          <div class="fila-meta cabecera-meta"><span>Meta</span><span>Unidad</span><span>Tarifa S/</span><span>Objetivo/día</span><span></span></div>
          ${metasPlan.map((m) => filaMeta(m)).join('')}
        </div>
        <button class="btn mini sec" type="button" id="add-meta">+ Añadir meta</button>
      ` : ''}`,
    textoGuardar: item ? 'Guardar' : 'Crear',
    onGuardar: async () => {
      const cuerpo = {};
      for (const c of def.campos) {
        const el = $(`#c-${c.name}`);
        if (!el) continue;
        if (c.tipo === 'checkbox') cuerpo[c.name] = el.checked;
        else if (c.tipo === 'number') cuerpo[c.name] = Number(el.value || 0);
        else if (c.tipo === 'dias') cuerpo[c.name] = $$('.c-dia').filter((x) => x.checked).map((x) => x.value);
        else cuerpo[c.name] = el.value.trim();
      }
      if (def.metas) {
        cuerpo.metasPlan = $$('#metas-editor .fila-meta').slice(1).map((fila) => {
          const [nombre, unidad, tarifa, objetivo] = $$('input', fila);
          return {
            nombre: nombre.value.trim(),
            unidad: (unidad.value || 'und').trim(),
            tarifa: Number(tarifa.value || 0),
            objetivoDia: Number(objetivo.value || 0),
          };
        }).filter((m) => m.nombre);
      }
      if (item) await api(`/${cat}/${item.id}`, { metodo: 'PUT', cuerpo });
      else await api(`/${cat}`, { metodo: 'POST', cuerpo });
      toast(item ? 'Actualizado.' : 'Creado.', 'ok');
    },
  });

  if (def.metas) {
    $('#add-meta').addEventListener('click', () => {
      const cont = $('#metas-editor');
      cont.insertAdjacentHTML('beforeend', filaMeta({}));
    });
  }
}

function filaMeta(m) {
  return `<div class="fila-meta">
    <input value="${esc(m.nombre || '')}" placeholder="Cajas empacadas" />
    <input value="${esc(m.unidad || 'und')}" placeholder="und" />
    <input type="number" step="0.1" value="${m.tarifa ?? 0}" />
    <input type="number" step="1" value="${m.objetivoDia ?? 0}" />
    <button class="icono-btn" type="button" onclick="this.closest('.fila-meta').remove()" aria-label="Quitar">✕</button>
  </div>`;
}

/* ------------------------------------------------------------ parámetros  */

async function vistaParametrosGH(cont) {
  const { config } = await api('/config');
  const num = (k, label, ayuda = '', step = '0.01') => `
    <div class="campo"><label>${label}</label>
      <input type="number" step="${step}" id="p-${k}" value="${config[k] ?? 0}" />
      ${ayuda ? `<div class="ayuda">${ayuda}</div>` : ''}
    </div>`;

  cont.innerHTML = `
  <div class="encabezado">
    <div><h1>Parámetros legales</h1><p>Ajusta las variables del régimen agrario que usa el motor de cálculo.</p></div>
    <button class="btn" data-accion="guardar-config">Guardar parámetros</button>
  </div>

  <div class="grid-3" style="align-items:start">
    <div class="tarjeta">
      <h3>Jornada y horas extras</h3>
      ${num('jornadaHoras', 'Jornada diaria (h)', '', '0.5')}
      ${num('horasSemana', 'Horas por semana', '', '1')}
      ${num('maxHorasExtraDia', 'Tope de horas extra / día', '', '0.5')}
      ${num('horasExtraTramo1', 'Horas del 1er tramo', '', '1')}
      ${num('sobretasaExtra1', 'Sobretasa 1er tramo', '0.25 = 25%', '0.01')}
      ${num('sobretasaExtra2', 'Sobretasa 2do tramo', '0.35 = 35%', '0.01')}
      ${num('sobretasaNocturna', 'Sobretasa nocturna', '0.35 = 35%', '0.01')}
      ${num('feriadoRecargo', 'Recargo por feriado', '1.00 = 100% del jornal', '0.01')}
      ${num('toleranciaMinutos', 'Tolerancia de tardanza (min)', '', '1')}
    </div>

    <div class="tarjeta">
      <h3>Beneficios sociales</h3>
      <div class="campo">
        <label>Esquema de beneficios</label>
        <select id="p-esquemaBeneficios">
          <option value="separado" ${config.esquemaBeneficios === 'separado' ? 'selected' : ''}>Separado (jornal + provisiones)</option>
          <option value="integral" ${config.esquemaBeneficios === 'integral' ? 'selected' : ''}>Integral (incluido en el jornal)</option>
        </select>
      </div>
      ${num('ctsDiasPorAnio', 'CTS (jornales/año)', '', '1')}
      ${num('gratificacionDias', 'Gratificación (jornales)', '', '1')}
      ${num('gratificacionesPorAnio', 'Gratificaciones por año', '', '1')}
      ${num('vacacionesDias', 'Vacaciones (jornales/año)', '', '1')}
      ${num('rmv', 'RMV (S/)', '', '1')}
      ${num('asignacionFamiliarPct', 'Asignación familiar', '0.10 = 10% RMV', '0.01')}
      ${num('descansoSemanalPorDias', 'Descanso semanal: 1 día por cada N días', '', '1')}
      ${num('semanasPorMes', 'Semanas por mes', '', '0.0001')}
    </div>

    <div class="tarjeta">
      <h3>Aportes y cargas</h3>
      ${num('onpPct', 'ONP', '0.13 = 13%', '0.01')}
      ${num('afpAportePct', 'AFP aporte obligatorio', '0.10 = 10%', '0.01')}
      ${num('afpComisionPct', 'Comisión AFP', '', '0.0001')}
      ${num('afpPrimaPct', 'Prima de seguro AFP', '', '0.0001')}
      ${num('essaludPct', 'EsSalud (empleador)', '0.09 = 9%', '0.01')}
      ${num('seguroVidaMensual', 'Seguro de vida (S/ mes)', '', '0.01')}
      <div class="campo">
        <label style="display:flex;gap:.5rem;align-items:center;font-weight:500">
          <input type="checkbox" id="p-aplicarDescansoSemanal" style="width:auto" ${config.aplicarDescansoSemanal ? 'checked' : ''} />
          Aplicar descanso semanal remunerado
        </label>
      </div>
    </div>
  </div>

  <div class="tarjeta" style="margin-top:1.25rem">
    <div class="seccion-titulo">
      <h2>Feriados del calendario</h2>
      <button class="btn mini sec" data-accion="add-feriado">+ Añadir feriado</button>
    </div>
    <div id="feriados-editor">
      ${(config.feriados || []).map((f) => filaFeriado(f)).join('') || '<div class="vacio">Sin feriados configurados.</div>'}
    </div>
  </div>`;

  $('[data-accion="add-feriado"]', cont).addEventListener('click', () => {
    const editor = $('#feriados-editor');
    if (editor.querySelector('.vacio')) editor.innerHTML = '';
    editor.insertAdjacentHTML('beforeend', filaFeriado({ fecha: S.datos.hoy, nombre: '' }));
  });

  $('[data-accion="guardar-config"]', cont).addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      const cuerpo = {};
      $$('[id^="p-"]', cont).forEach((input) => {
        const clave = input.id.slice(2);
        if (input.type === 'checkbox') cuerpo[clave] = input.checked;
        else if (input.type === 'number') cuerpo[clave] = Number(input.value || 0);
        else cuerpo[clave] = input.value;
      });
      cuerpo.feriados = $$('.fila-feriado', cont).map((fila) => ({
        fecha: $('.f-fecha', fila).value,
        nombre: $('.f-nombre', fila).value,
      })).filter((f) => f.fecha);
      await api('/config', { metodo: 'PUT', cuerpo });
      toast('Parámetros actualizados.', 'ok');
      renderVista();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });
}

function filaFeriado(f) {
  return `<div class="fila-feriado" style="display:flex;gap:.5rem;margin-bottom:.45rem;align-items:center">
    <input type="date" class="f-fecha" value="${esc(f.fecha || '')}" style="padding:.45rem .55rem;border:1px solid var(--borde);border-radius:8px" />
    <input class="f-nombre" value="${esc(f.nombre || '')}" placeholder="Nombre del feriado" style="flex:1;padding:.45rem .55rem;border:1px solid var(--borde);border-radius:8px" />
    <button class="icono-btn" type="button" onclick="this.closest('.fila-feriado').remove()" aria-label="Quitar">✕</button>
  </div>`;
}

/* ------------------------------------------------------------------ modal */

function abrirModal({ titulo, cuerpo, textoGuardar = 'Guardar', onGuardar }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <header>
        <h3>${titulo}</h3>
        <button class="icono-btn" data-modal-cerrar aria-label="Cerrar">✕</button>
      </header>
      <div class="modal-cuerpo">${cuerpo}</div>
      <footer>
        <button class="btn sec" data-modal-cerrar>Cancelar</button>
        <button class="btn" data-modal-guardar>${textoGuardar}</button>
      </footer>
    </div>`;
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  $$('[data-modal-cerrar]', fondo).forEach((b) => b.addEventListener('click', cerrar));
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });

  $('[data-modal-guardar]', fondo).addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      await onGuardar();
      cerrar();
      renderVista();
    } catch (error) {
      toast(error.message, 'error');
      boton.disabled = false;
    }
  });
}

/* --------------------------------------------------------------- acciones */

document.addEventListener('click', async (evento) => {
  const btn = evento.target.closest('[data-accion="logout"], [data-accion="guardar-jornal"]');
  if (!btn) return;

  if (btn.dataset.accion === 'logout') {
    try { await api('/auth/logout', { metodo: 'POST' }); } catch { /* sesión local igual se limpia */ }
    S.usuario = null;
    S.datos = null;
    S.sim = null;
    $('#app').innerHTML = vistaLogin('trabajador');
    bindLogin();
    return;
  }

  if (btn.dataset.accion === 'guardar-jornal') {
    btn.disabled = true;
    try {
      const entrada = leerEntradaSim();
      await api('/mis-registros', { metodo: 'POST', cuerpo: entrada });
      toast('Jornal guardado y enviado a Gestión Humana.', 'ok');
      S.datos = await api('/bootstrap');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }
});

/* ------------------------------------------------------------------- init */

(async function iniciar() {
  try {
    const { usuario } = await api('/auth/me');
    if (usuario) {
      S.usuario = usuario;
      await cargarBootstrap();
      return;
    }
  } catch { /* sin sesión */ }
  $('#app').innerHTML = vistaLogin('trabajador');
  bindLogin();
})();
