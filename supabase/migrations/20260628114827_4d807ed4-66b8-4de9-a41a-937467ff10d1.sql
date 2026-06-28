-- =====================================================================
-- Legal documents — Spanish (es) translations  [DRAFT]
-- Mirrors en/fr/de authoritative versions. Idempotent.
-- =====================================================================

-- 1) legal_notice v2 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('legal_notice', 2, 'es', false, 'Aviso legal',
$body$> **BORRADOR — NO REVISADO JURÍDICAMENTE.** Traducción asistida por máquina, revisión legal pendiente.

# Clubero — Aviso legal

_Última actualización: 28 de junio de 2026_

## Editor

**Clubero OÜ** — sociedad de responsabilidad limitada estonia (Osaühing / OÜ).

- Razón social: Clubero OÜ
- Número de registro (registrikood): **17538695**
- Domicilio social: Sepapaja tn 6, 15551 Tallin, Estonia
- Fecha de constitución: 25 de junio de 2026
- IVA: **Sin IVA facturado** — Clubero OÜ no está registrada a efectos del IVA en este momento.
- Actividad: empresa de software — plataforma SaaS para clubes deportivos (NACE 58.29)
- Contacto: **hello@clubero.app**
- Sitio web: <https://clubero.app>

Toda correspondencia (legal, protección de datos, seguridad, abuso) se gestiona a través de **hello@clubero.app**.

## Responsable de la publicación

El responsable de la publicación es el representante legal de Clubero OÜ.

## Alojamiento e infraestructura

- **Cloudflare, Inc.** — 101 Townsend Street, San Francisco, CA 94107, EE. UU. — alojamiento de la aplicación (Workers / runtime edge).
- **Supabase** (Supabase Inc.) — región UE — base de datos, autenticación y almacenamiento.
- **Lovable** (Lovable AB) — plataforma de desarrollo y alojamiento, así como pasarela de IA para distribuir las funciones de IA.

## Propiedad intelectual

El Servicio, su código fuente, su diseño y su identidad de marca (incluidos el nombre y el logotipo «Clubero») son propiedad exclusiva de Clubero OÜ. Queda prohibida toda reproducción, representación o reutilización sin autorización previa por escrito.

## Notificación de abusos y retirada de contenidos

Las notificaciones de contenidos ilícitos o abusivos pueden enviarse a **hello@clubero.app**. Indique una descripción del contenido, la URL y el motivo de la notificación.

## Resolución de litigios

Para los litigios de consumo, la plataforma de Resolución de Litigios en Línea de la Comisión Europea está disponible en <https://ec.europa.eu/consumers/odr>.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 2) terms v4 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('terms', 4, 'es', true, 'Condiciones generales de uso de Clubero',
$body$> **BORRADOR — NO REVISADO JURÍDICAMENTE.** Traducción asistida por máquina, revisión legal pendiente.

# Condiciones generales de uso de Clubero

_Última actualización: 28 de junio de 2026_

Le damos la bienvenida a **Clubero** («Clubero», «nosotros»), plataforma SaaS operada por **Clubero OÜ**, sociedad de responsabilidad limitada de Derecho estonio (registrikood **17538695**), con domicilio en Sepapaja tn 6, 15551 Tallin, Estonia. No se factura IVA (Clubero OÜ no está registrada a efectos del IVA en este momento). Las presentes condiciones de uso («Condiciones») regulan su acceso y uso de las aplicaciones web y móviles, sitios web y servicios relacionados de Clubero (conjuntamente, el «Servicio»).

Al crear una cuenta o utilizar el Servicio, usted acepta las presentes Condiciones.

## 1. Descripción general de la plataforma

Clubero ayuda a clubes deportivos, entrenadores, padres y jugadores a gestionar equipos, comunicarse, organizar partidos y entrenamientos, gestionar inscripciones y pagos, compartir documentos y recibir notificaciones.

## 2. Creación de cuenta

- Debe facilitar información veraz al crear una cuenta.
- Es responsable de la confidencialidad de sus credenciales.
- Debe tener al menos **18 años** para crear y administrar una cuenta por sí mismo. Las personas menores de 18 años solo pueden utilizar Clubero a través de una cuenta creada y supervisada por un titular de la patria potestad (véanse §4 y la página de consentimiento parental).

## 3. Funciones de usuario

El Servicio admite varias funciones: **administrador del club**, **entrenador / responsable**, **padre/madre o representante legal**, **jugador** y **administrador de la plataforma**. Cada función dispone de permisos definidos dentro del Servicio. Usted se compromete a utilizar el Servicio únicamente dentro del alcance de la función que le ha sido asignada.

## 4. Menores

Un jugador menor solo puede ser añadido por un titular de la patria potestad, quien otorga los consentimientos parentales requeridos (véase la página de consentimiento parental). El progenitor es el destinatario prioritario de las notificaciones relativas al menor. El menor solo dispondrá de un acceso propio si el progenitor lo autoriza expresamente.

## 5. Uso aceptable

Usted se compromete a no:

- subir contenidos ilícitos, de odio, acosadores, difamatorios o sexualmente explícitos;
- recoger o difundir datos personales de otros usuarios sin su consentimiento;
- alterar, descompilar, hacer scraping o atacar el Servicio;
- suplantar la identidad de una persona o club;
- utilizar el Servicio para enviar comunicaciones comerciales no solicitadas.

Los contenidos o cuentas que infrinjan estas normas podrán ser retirados o suspendidos.

## 6. Pagos

Determinadas funciones (inscripciones, pagos de eventos, campañas de recaudación) pueden implicar pagos procesados por **Stripe**. Stripe es el proveedor de pagos; Clubero nunca almacena los datos completos de su tarjeta. Los reembolsos, contracargos y obligaciones fiscales se rigen por las políticas del club correspondiente y la legislación aplicable. Las comisiones de servicio, si las hubiera, se mostrarán antes del pago.

## 7. Disponibilidad del Servicio

Aspiramos a una alta disponibilidad, pero no garantizamos un Servicio ininterrumpido ni libre de errores. Podemos realizar tareas de mantenimiento, publicar actualizaciones o modificar funciones en cualquier momento.

## 8. Suspensión y resolución

Podemos suspender o resolver el acceso al Servicio en caso de incumplimiento de las presentes Condiciones, obligación legal o necesidad de proteger a los usuarios. Usted puede eliminar su cuenta en cualquier momento desde **Perfil → Privacidad** (véase también el §10 de la Política de Privacidad).

## 9. Limitación de responsabilidad

En la medida permitida por la ley, Clubero no será responsable de daños indirectos, incidentales o consecuentes, pérdida de datos, lucro cesante o pérdida de oportunidades. Nuestra responsabilidad total por cualquier reclamación se limita a las cantidades que usted nos haya abonado por el Servicio en los doce meses anteriores a la reclamación.

## 10. Propiedad intelectual

Clubero, sus logotipos y su software están protegidos por las leyes de propiedad intelectual. Usted conserva la titularidad de los contenidos que sube y concede a Clubero una licencia limitada para alojarlos y mostrarlos con el fin de operar el Servicio.

## 11. Ley aplicable

Las presentes Condiciones se rigen por la ley estonia. Los litigios estarán sujetos a la jurisdicción exclusiva de los tribunales competentes de Estonia (Harju Maakohus, Tallin), sin perjuicio de las disposiciones imperativas de protección al consumidor de su país de residencia.

## 12. Modificaciones

Podemos modificar las presentes Condiciones. Cualquier modificación sustancial se comunicará al menos 14 días antes de su entrada en vigor, en la aplicación y por correo electrónico. El uso continuado tras la fecha de entrada en vigor implica aceptación.

## 13. Contacto

Para cualquier pregunta sobre las presentes Condiciones: **hello@clubero.app** — Clubero OÜ, Sepapaja tn 6, 15551 Tallin, Estonia.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 3) privacy v4 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('privacy', 4, 'es', true, 'Política de Privacidad',
$body$> **BORRADOR — NO REVISADO JURÍDICAMENTE.** Traducción asistida por máquina, revisión legal pendiente.

# Clubero — Política de Privacidad

_Última actualización: 28 de junio de 2026_

Clubero está operado por **Clubero OÜ** (registrikood **17538695**, Sepapaja tn 6, 15551 Tallin, Estonia), responsable del tratamiento de los datos personales procesados a través del Servicio. La presente Política de Privacidad describe qué datos recogemos, para qué finalidad y qué derechos le asisten conforme al **Reglamento General de Protección de Datos (RGPD)**.

## 1. Datos recogidos

- **Datos de cuenta**: nombre, correo electrónico, teléfono, contraseña (con hash), avatar, idioma, función.
- **Datos del jugador**: nombre y apellidos, fecha de nacimiento, dorsal, posición, foto (con consentimiento), equipo(s).
- **Vínculos padre/hijo**: relación entre el progenitor y el jugador menor.
- **Datos del club y del equipo**: pertenencia, función dentro del club, asignaciones de equipo.
- **Datos operativos**: eventos, asistencias, inscripciones, alineaciones, mensajes, archivos adjuntos.
- **Metadatos de pago**: importes, estado, referencias — los datos completos de la tarjeta son tratados por **Stripe** y nunca almacenados por nosotros.
- **Datos técnicos**: dirección IP, agente de usuario, información del dispositivo, registros (seguridad y depuración).

**No** recogemos datos biométricos, ni datos de salud, ni puntuación de comportamiento, ni realizamos **ningún** perfilado por IA de menores.

## 2. Finalidades del tratamiento

| Finalidad | Base jurídica |
|---|---|
| Prestación y funcionamiento del Servicio | Contrato (Art. 6.1.b) |
| Gestión de cuentas de menores | Consentimiento parental (Art. 6.1.a + Art. 8) |
| Envío de correos electrónicos y notificaciones | Contrato / Consentimiento |
| Procesamiento de pagos vía Stripe | Contrato |
| Seguridad, prevención del fraude, auditoría | Obligación legal, interés legítimo |
| Cumplimiento de obligaciones legales | Obligación legal (Art. 6.1.c) |

## 3. Principios del RGPD respetados

Licitud, lealtad, transparencia · Limitación de la finalidad · Minimización de datos · Exactitud · Limitación del plazo de conservación · Integridad y confidencialidad · Responsabilidad proactiva.

## 4. Menores y patria potestad

El artículo 8 del RGPD permite a los Estados miembros fijar entre 13 y 16 años la edad mínima a partir de la cual un menor puede consentir por sí mismo el tratamiento en los servicios de la sociedad de la información (a título informativo: 13 en Estonia, 14 en España, 15 en Francia, 16 en Luxemburgo). Clubero aplica deliberadamente un umbral único y más estricto en todos los países: **toda persona menor de 18 años se considera menor** y solo puede utilizar Clubero a través de una cuenta creada y supervisada por un titular de la patria potestad, quien otorga el consentimiento parental y puede retirarlo en cualquier momento desde **Perfil → Privacidad** o desde el perfil del jugador. Clubero no se basa en un consentimiento autónomo del menor a las edades nacionales inferiores. Véase la página específica de **consentimiento parental**.

## 5. Plazos de conservación

| Datos | Duración |
|---|---|
| Cuenta activa | Duración de la cuenta + 30 días tras la solicitud de eliminación |
| Jugadores que han abandonado el club | 1 temporada deportiva con fines estadísticos |
| Mensajes y archivos adjuntos | 24 meses |
| Registros de auditoría | 12 meses |
| Pruebas de consentimiento | 5 años tras la retirada |
| Datos de pago | Según las obligaciones fiscales y contables |

## 6. Sus derechos

En virtud del RGPD, le asisten los siguientes derechos:

- **Acceso** (Art. 15) — descargue sus datos desde **Perfil → Privacidad → Descargar mis datos**.
- **Rectificación** (Art. 16) — edite su perfil o el de su hijo.
- **Supresión** (Art. 17) — solicite la eliminación de su cuenta (plazo de gracia de 30 días, después anonimización).
- **Limitación / Oposición** (Art. 18 / 21) — retire sus consentimientos.
- **Portabilidad** (Art. 20) — las exportaciones se entregan en formato JSON.
- **Reclamación** — ante la autoridad de control competente. La autoridad principal de Clubero es la autoridad estonia de protección de datos (**Andmekaitse Inspektsioon**); puede también dirigirse a su autoridad nacional (por ejemplo, AEPD en España, CNIL en Francia, CNPD en Luxemburgo).

## 7. Eliminación y exportación de datos

- **Exportación**: se genera bajo petición un archivo JSON con sus datos y los de sus hijos menores.
- **Eliminación**: las solicitudes se programan con un plazo de gracia de 30 días; a continuación, sus identificadores personales se sustituyen por marcadores anónimos y los contenidos se desvinculan de su identidad. Las estadísticas agregadas del club pueden conservarse.

## 8. Cookies y analítica

Utilizamos un número mínimo de cookies y almacenamiento local estrictamente necesarios para la autenticación, la seguridad y la conservación de sus preferencias. **No** utilizamos rastreadores publicitarios ni cookies publicitarias de terceros. Cualquier futura medición de audiencia respetará la privacidad y se documentará aquí.

## 9. Encargados del tratamiento

Nos apoyamos en un número limitado de encargados del tratamiento de confianza: **Supabase / alojamiento de base de datos y autenticación** (región UE), **Stripe** (pagos), **proveedores de correo y SMS** (notificaciones), **alojamiento en la nube** (Cloudflare) y **Lovable** (Lovable AB) como plataforma de desarrollo y alojamiento, así como pasarela de IA para enrutar las funciones de IA (tránsito de prompts y metadatos). La lista actualizada está disponible bajo petición en **hello@clubero.app**.

## 10. Transferencias internacionales de datos

Los datos se almacenan en la **Unión Europea**. Cuando un encargado del tratamiento procese datos fuera de la UE, las transferencias se enmarcarán en cláusulas contractuales tipo o garantías equivalentes.

## 11. Seguridad

Cifrado en tránsito (TLS), cifrado en reposo, control de acceso basado en funciones, registro de auditoría y claves de mínimo privilegio. A pesar de nuestros esfuerzos, ningún servicio es 100 % seguro; comunique cualquier vulnerabilidad a **hello@clubero.app**.

## 12. Comunicar un abuso

Para comunicar contenidos abusivos, acoso o un problema de seguridad: **hello@clubero.app**. Respondemos en un plazo de 5 días hábiles.

## 13. Contacto

Responsable del tratamiento: **Clubero OÜ**, Sepapaja tn 6, 15551 Tallin, Estonia. Solicitudes en materia de protección de datos y demás cuestiones: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 4) data_processing v2 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('data_processing', 2, 'es', true, 'Acuerdo de tratamiento de datos',
$body$> **BORRADOR — NO REVISADO JURÍDICAMENTE.** Traducción asistida por máquina, revisión legal pendiente.

# Clubero — Tratamiento de datos

_Última actualización: 28 de junio de 2026_

Este documento complementa la Política de Privacidad y describe cómo Clubero trata los datos personales por cuenta de los clubes y de los usuarios.

## 1. Funciones

- **Clubero OÜ** es **Responsable del tratamiento** de los datos de cuenta, autenticación, facturación y plataforma.
- Para los datos operativos propios de cada club (plantilla, eventos, mensajes), Clubero actúa como **Encargado del tratamiento** para el club, que en ese ámbito es Responsable.

## 2. Categorías de datos

Identificación, contacto, función, asistencia, comunicación, archivos adjuntos, metadatos de pago. Sin datos biométricos, ni datos de salud, ni perfilado de menores.

## 3. Subencargados

Véase el §9 de la Política de Privacidad. Los clubes son informados de los nuevos subencargados y pueden oponerse por motivos legítimos.

## 4. Medidas de seguridad

Cifrado en tránsito y en reposo, control de acceso basado en funciones, registros de auditoría, claves de servicio con mínimos privilegios, separación de los entornos de prueba y producción, actualización periódica de dependencias.

## 5. Solicitudes de los interesados

Clubero asiste a los clubes para responder a las solicitudes de los interesados (acceso, rectificación, supresión, portabilidad) dentro de los plazos legales.

## 6. Notificación de brechas

Clubero notifica a los clubes y usuarios afectados sin demora indebida y en un plazo de 72 horas tras tener conocimiento de una violación de datos personales, conforme al Art. 33 del RGPD.

## 7. Fin del tratamiento

A la finalización, los datos del club se eliminan o se devuelven en un plazo de 30 días, salvo que exista una obligación legal de conservación.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();

-- 5) parental_consent v1 es
INSERT INTO public.consent_versions (kind, version, locale, required, title, content_md, published_at)
VALUES ('parental_consent', 1, 'es', false, 'Consentimiento parental',
$body$> **BORRADOR — NO REVISADO JURÍDICAMENTE.** Traducción asistida por máquina, revisión legal pendiente.

# Clubero — Consentimiento parental

_Última actualización: 28 de junio de 2026_

Esta página describe los consentimientos otorgados por un titular de la patria potestad al añadir a un menor a Clubero. Complementa la Política de Privacidad y la página de consentimiento para fotografías y medios.

## 1. Quién puede otorgar el consentimiento parental

Solo un titular de la **patria potestad** (progenitor o representante legal) puede consentir en nombre de un menor. Al otorgar el consentimiento, usted declara estar legalmente facultado para ello respecto del menor en cuestión.

## 2. Qué autoriza

- La creación de un perfil de jugador para su hijo (nombre y apellidos, fecha de nacimiento, dorsal, posición, equipo).
- La compartición de dicho perfil con el cuerpo técnico del club del menor (administrador, entrenador) y con los demás padres/jugadores del mismo equipo, exclusivamente con fines de organización deportiva.
- La recepción de notificaciones operativas (convocatorias, cambios de horario, inscripciones, pagos) en nombre del menor.

## 3. Consentimiento para fotografías y medios

La publicación de fotografías y vídeos cortos del menor en las páginas del club, del equipo y de los eventos requiere un consentimiento **distinto y opcional**. Puede otorgarlo o denegarlo en cualquier momento desde el perfil del jugador. Véase la página **Consentimiento para fotografías y medios**.

## 4. Acceso de cuenta para el menor

Por defecto, el menor **no** recibe credenciales propias. Usted puede, a su discreción, autorizar la creación de una cuenta en nombre del menor. En tal caso, el menor recibirá un correo de acceso y el progenitor seguirá siendo el destinatario prioritario de las comunicaciones importantes.

## 5. Retirada del consentimiento

Puede retirar su consentimiento en cualquier momento desde **Perfil → Privacidad** o desde el perfil del jugador. La retirada pone fin al tratamiento correspondiente y puede implicar la baja del menor en las actividades del equipo organizadas a través de Clubero.

## 6. Papel de los representantes legales

Cuando la patria potestad se ejerza de forma conjunta, ambos progenitores podrán administrar el perfil del menor. En caso de desacuerdo, Clubero se basará en el progenitor registrado que haya creado la cuenta, sin perjuicio de cualquier resolución judicial que usted aporte.

## 7. Contacto

Para cualquier consulta sobre los datos de un menor: **hello@clubero.app**.
$body$, now())
ON CONFLICT (kind, version, locale) DO UPDATE
  SET title = EXCLUDED.title, required = EXCLUDED.required,
      content_md = EXCLUDED.content_md, published_at = now();