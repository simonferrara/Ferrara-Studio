/* Brown Air — AI Front Desk demo (Ferrara Studio mockup)
 *
 * Part 1 is the conversation engine: a scripted, bilingual state machine with no DOM
 * access, so it can be unit-tested in Node (tools/test-frontdesk.mjs).
 * Part 2 is the chat widget that renders it.
 *
 * Nothing is sent anywhere. The live version swaps the engine for an LLM that follows
 * docs/frontdesk-system-prompt.md and calls real scheduling and email tools.
 * Every factual answer below comes from brownairandheat.com as read on 2026-11-16.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrownFrontDeskEngine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TEL_HREF = 'tel:+12819982665';
  const PHONE = '281-998-2665';
  const TEL = `<a href="${TEL_HREF}">${PHONE}</a>`;
  const EMAIL = 'service@brownairandheat.com';

  // Service region as listed on the current Contact page. Multi-word names first so "South Houston" wins over "Houston".
  const AREAS = [
    ['south houston', 'South Houston'], ['texas city', 'Texas City'], ['jacinto city', 'Jacinto City'], ['league city', 'League City'],
    ['galena park', 'Galena Park'], ['deer park', 'Deer Park'], ['clear lake', 'Clear Lake'], ['la marque', 'La Marque'],
    ['la porte', 'La Porte'], ['santa fe', 'Santa Fe'], ['morgan', 'Morgan’s Point'], ['woodlands', 'The Woodlands'],
    ['alvin', 'Alvin'], ['bacliff', 'Bacliff'], ['baytown', 'Baytown'], ['channelview', 'Channelview'], ['dickinson', 'Dickinson'],
    ['friendswood', 'Friendswood'], ['galveston', 'Galveston'], ['hitchcock', 'Hitchcock'], ['kemah', 'Kemah'], ['manvel', 'Manvel'],
    ['pasadena', 'Pasadena'], ['pearland', 'Pearland'], ['seabrook', 'Seabrook'], ['webster', 'Webster'], ['houston', 'Houston'],
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ------------------------------------------------------------ copy */

  const T = {
    en: {
      greetOpen: 'Hi, this is the virtual assistant for Brown Air Conditioning &amp; Heating. I can take your details, flag emergencies and request a service window. Hablo español también.',
      greetClosed: 'Hi, this is the virtual assistant for Brown Air Conditioning &amp; Heating. The office is closed right now (hours are Mon–Fri, 8 AM–5 PM), but I answer around the clock: I can take your details, flag emergencies to the on-call technician and request a service window. Hablo español también.',
      hello: 'Hello.',
      switched: 'Sure, we can continue in English.',
      restart: 'No problem, let’s start again.',
      askIssue: 'What’s going on with your system?',
      issues: ['No cooling', 'No heat', 'Strange noise', 'Water leak', 'Maintenance or tune-up', 'New system quote', 'Something else'],
      issueLabel: { cool: 'No cooling', heat: 'No heat', noise: 'Strange noise', leak: 'Water leak', maint: 'Maintenance or tune-up', quote: 'New system quote', other: 'Other', gas: 'Possible gas or carbon monoxide emergency' },
      ack: {
        cool: 'Sorry about that. Warm air can come from the thermostat, a clogged filter, low refrigerant or the compressor. A technician will find the exact cause.',
        heat: 'Sorry about that. A heater blowing cold air usually comes down to thermostat settings, ignition, a dirty filter or the ducts. A technician will diagnose it.',
        noise: 'Thanks. A technician will need to hear it and inspect the system.',
        leak: 'Thanks. A technician will check the drain line and the rest of the system.',
        maint: 'Good call. Systems should be serviced at least once a year: AC before summer, heating before winter.',
        quote: 'Happy to help. A team member will go over the options for a new system, including financing.',
        other: 'Got it, I’ll pass that along.',
      },
      askUrgency: 'How urgent is it?',
      urgencies: ['Emergency, need help now', 'Today or tomorrow', 'This week', 'No rush'],
      urgencyLabel: { emergency: 'Emergency, needs help now', soon: 'Today or tomorrow', week: 'This week', flexible: 'No rush', routine: 'Routine' },
      emergCool: `<strong>I’m flagging this as an emergency.</strong> No cooling in Houston heat can be dangerous, especially for children, older adults and anyone with a medical condition. For the fastest response, call the on-call line now: ${TEL}. I’ll also send your details to the on-call technician.`,
      emergHeat: `<strong>I’m flagging this as an emergency.</strong> No heat in freezing weather can be dangerous, especially for children, older adults and anyone with a medical condition. For the fastest response, call the on-call line now: ${TEL}. I’ll also send your details to the on-call technician.`,
      emergOther: `Understood, I’m marking this urgent. You can also call ${TEL} right now.`,
      onCallTerms: 'On-call service is subject to technician availability, and an after-hours fee applies. The technician confirms the details.',
      gasAlert: '<strong>If you smell gas or a carbon monoxide alarm is sounding, leave the building now.</strong> Don’t use light switches, appliances or anything that could spark. Once you’re outside and safe, call 911 and your gas company’s emergency line. Don’t go back inside until responders say it is safe.',
      gasFollow: 'When everyone is safe, I can take your details so a technician follows up.',
      askName: 'What’s your name?',
      badName: 'Sorry, I didn’t catch your name. What should the technician call you?',
      askPhone: (first) => `Thanks, ${first}. What’s the best phone number to reach you?`,
      badPhone: 'That number looks incomplete. Please send all 10 digits, area code first.',
      askAddress: 'What’s the service address? Street plus city or ZIP is enough.',
      badAddress: 'I need a street address or ZIP code to pass along. What’s the service address?',
      areaYes: (city) => `${city} is in our service area.`,
      areaMaybe: 'Thanks. A team member will confirm we cover that address.',
      askMode: 'Would you like to request a service window, or have the office call you back?',
      modes: ['Request a service window', 'Call me back'],
      askWindow: 'Which window works best? The office confirms the exact arrival time.',
      parts: { am: 'Morning', pm: 'Afternoon' },
      partLong: { am: 'morning (8 AM–12 PM)', pm: 'afternoon (12–5 PM)' },
      firstAvail: 'First available',
      firstAvailLong: 'the first available window',
      askCallback: 'When should we call?',
      callbacks: ['As soon as possible', 'Morning', 'Afternoon'],
      callbackLabel: { asap: 'as soon as possible', am: 'in the morning', pm: 'in the afternoon' },
      askNotes: 'Anything the technician should know? System age, gate code, pets. Or tap Skip.',
      skip: 'Skip',
      summaryIntro: 'Here’s what I have:',
      confirmAsk: 'Is that right?',
      confirmChips: ['Yes, send it', 'Start over'],
      reqWindow: (w) => `Service window: ${w}`,
      reqCallback: (w) => `Callback ${w}`,
      reqOnCall: 'Callback from the on-call technician',
      sentWindow: (w) => `Done. I’ve requested ${w}. The office confirms the exact arrival time by phone.`,
      sentCallback: (phone, w) => `Done. The office will call ${phone} ${w}.`,
      sentClosed: 'The office opens at 8 AM on the next business day.',
      sentEmergency: (phone) => `Done. The on-call technician has your details and will call ${phone}. If you need help faster, call ${TEL}.`,
      doneChips: ['Ask a question', 'Start a new request'],
      askAnything: 'Go ahead, what would you like to know?',
      fallbackDone: `I’ve noted that for the team. For anything urgent, call ${TEL}.`,
      unknownQ: 'I don’t have that answer here, so I’ve noted your question for the team.',
      human: `You can reach the team at ${TEL}. Office hours are Mon–Fri, 8 AM–5 PM, and a technician is on call 24/7 for emergencies. I can also take your details here.`,
      thanks: 'You’re welcome. Stay comfortable.',
      faq: {
        price: 'I can’t quote prices in chat. A technician confirms the price with you before any work begins.',
        priceMore: 'I can get your request started so they can do that.',
        hours: 'Office hours are Monday to Friday, 8 AM to 5 PM. A technician is on call 24/7, subject to availability.',
        emergency: `Yes, a technician is on call 24/7, subject to availability. After-hours repairs are limited to truck stock and an after-hours fee applies; the technician confirms the details. For an emergency, call ${TEL}.`,
        area: 'We serve Southeast Houston and Galveston County, including Pasadena, Deer Park, La Porte, Pearland, League City, Friendswood, Baytown and Galveston, and now The Woodlands. Send me your address and a team member will confirm.',
        services: 'For homes: air conditioning, AC check-ups, furnaces, heat pumps, ductless mini-splits, ductwork and indoor air quality. We also install, repair and maintain commercial HVAC systems.',
        financing: 'Yes, flexible financing options are available for new installations and major repairs. A team member will go over them with you.',
        license: 'Yes. Technicians are licensed and insured, and every employee passes a background check. Texas license TACLA971E.',
        location: 'The office is at 2727 Beverly Road, Pasadena, TX 77503. Most work happens at your home, so call ahead before visiting.',
        frequency: 'At least once a year: AC before summer, heating before winter.',
        plan: 'Yes. Brown’s Service Agreement is a preventive maintenance program: technicians clean, inspect and tune your heating and cooling systems ahead of each season.',
        brands: 'We service all makes and models, and install brands with a proven reliability record. A technician can recommend the right fit.',
        warranty: 'Yes, we can still repair and service a system that is out of warranty.',
        commercial: 'Yes, we install, repair and maintain commercial HVAC systems.',
        lifespan: 'Most AC systems last 10 to 15 years with proper maintenance.',
        careers: 'We’re hiring. See the <a href="/mockups/brown-air-and-heat/careers/">Careers page</a> to apply.',
        spanish: 'Sí, puedo ayudarle en español. Escriba en español cuando quiera.',
      },
    },
    es: {
      greetOpen: 'Hola, soy el asistente virtual de Brown Air Conditioning &amp; Heating. Puedo tomar sus datos, marcar emergencias y solicitar un horario de servicio.',
      greetClosed: 'Hola, soy el asistente virtual de Brown Air Conditioning &amp; Heating. La oficina está cerrada en este momento (el horario es de lunes a viernes, de 8 a. m. a 5 p. m.), pero yo atiendo las 24 horas: puedo tomar sus datos, avisar al técnico de guardia si es una emergencia y solicitar un horario de servicio.',
      hello: 'Hola.',
      switched: 'Claro, continuamos en español.',
      restart: 'No hay problema, empecemos de nuevo.',
      askIssue: '¿Qué problema tiene con su sistema?',
      issues: ['No enfría', 'No calienta', 'Ruido extraño', 'Fuga de agua', 'Mantenimiento', 'Cotización de sistema nuevo', 'Otra cosa'],
      issueLabel: { cool: 'No enfría', heat: 'No calienta', noise: 'Ruido extraño', leak: 'Fuga de agua', maint: 'Mantenimiento', quote: 'Cotización de sistema nuevo', other: 'Otro', gas: 'Posible emergencia de gas o monóxido de carbono' },
      ack: {
        cool: 'Lo siento. El aire caliente puede deberse al termostato, a un filtro tapado, a falta de refrigerante o al compresor. Un técnico encontrará la causa exacta.',
        heat: 'Lo siento. Cuando la calefacción echa aire frío, suele ser el termostato, el encendido, un filtro sucio o los ductos. Un técnico lo revisará.',
        noise: 'Gracias. Un técnico tendrá que escucharlo y revisar el sistema.',
        leak: 'Gracias. Un técnico revisará la línea de drenaje y el resto del sistema.',
        maint: 'Buena idea. Los sistemas deben recibir servicio al menos una vez al año: el aire acondicionado antes del verano y la calefacción antes del invierno.',
        quote: 'Con gusto. Un miembro del equipo le explicará las opciones para un sistema nuevo, incluido el financiamiento.',
        other: 'Entendido, lo paso al equipo.',
      },
      askUrgency: '¿Qué tan urgente es?',
      urgencies: ['Emergencia, necesito ayuda ya', 'Hoy o mañana', 'Esta semana', 'Sin prisa'],
      urgencyLabel: { emergency: 'Emergencia, necesita ayuda ya', soon: 'Hoy o mañana', week: 'Esta semana', flexible: 'Sin prisa', routine: 'De rutina' },
      emergCool: `<strong>Voy a marcar esto como emergencia.</strong> Estar sin aire acondicionado con el calor de Houston puede ser peligroso, sobre todo para niños, personas mayores y cualquier persona con una condición médica. Para una respuesta más rápida, llame ahora a la línea de guardia: ${TEL}. También enviaré sus datos al técnico de guardia.`,
      emergHeat: `<strong>Voy a marcar esto como emergencia.</strong> Estar sin calefacción durante una helada puede ser peligroso, sobre todo para niños, personas mayores y cualquier persona con una condición médica. Para una respuesta más rápida, llame ahora a la línea de guardia: ${TEL}. También enviaré sus datos al técnico de guardia.`,
      emergOther: `Entendido, lo marco como urgente. También puede llamar ahora al ${TEL}.`,
      onCallTerms: 'El servicio de guardia depende de la disponibilidad de técnicos y se cobra un cargo fuera de horario. El técnico le confirma los detalles.',
      gasAlert: '<strong>Si huele a gas o está sonando una alarma de monóxido de carbono, salga del edificio ahora.</strong> No use interruptores de luz, aparatos ni nada que pueda producir una chispa. Cuando esté afuera y a salvo, llame al 911 y a la línea de emergencias de su compañía de gas. No vuelva a entrar hasta que los servicios de emergencia digan que es seguro.',
      gasFollow: 'Cuando todos estén a salvo, puedo tomar sus datos para que un técnico le dé seguimiento.',
      askName: '¿Cuál es su nombre?',
      badName: 'Disculpe, no entendí su nombre. ¿Cómo debe llamarle el técnico?',
      askPhone: (first) => `Gracias, ${first}. ¿A qué número de teléfono podemos llamarle?`,
      badPhone: 'Ese número parece incompleto. Envíe los 10 dígitos, empezando por el código de área.',
      askAddress: '¿Cuál es la dirección del servicio? Con la calle y la ciudad o el código postal es suficiente.',
      badAddress: 'Necesito una dirección o un código postal para pasarlo al equipo. ¿Cuál es la dirección del servicio?',
      areaYes: (city) => `${city} está dentro de nuestra área de servicio.`,
      areaMaybe: 'Gracias. Un miembro del equipo confirmará que cubrimos esa dirección.',
      askMode: '¿Prefiere solicitar un horario de servicio o que la oficina le devuelva la llamada?',
      modes: ['Solicitar un horario', 'Que me llamen'],
      askWindow: '¿Qué horario le conviene? La oficina confirma la hora exacta de llegada.',
      parts: { am: 'Mañana', pm: 'Tarde' },
      partLong: { am: 'por la mañana (8 a. m. a 12 p. m.)', pm: 'por la tarde (12 a 5 p. m.)' },
      firstAvail: 'Primer horario disponible',
      firstAvailLong: 'el primer horario disponible',
      askCallback: '¿Cuándo le llamamos?',
      callbacks: ['Lo antes posible', 'Por la mañana', 'Por la tarde'],
      callbackLabel: { asap: 'lo antes posible', am: 'por la mañana', pm: 'por la tarde' },
      askNotes: '¿Algo que el técnico deba saber? Antigüedad del sistema, código del portón, mascotas. O toque Omitir.',
      skip: 'Omitir',
      summaryIntro: 'Esto es lo que tengo:',
      confirmAsk: '¿Es correcto?',
      confirmChips: ['Sí, enviar', 'Empezar de nuevo'],
      reqWindow: (w) => `Horario de servicio: ${w}`,
      reqCallback: (w) => `Devolver la llamada ${w}`,
      reqOnCall: 'Llamada del técnico de guardia',
      sentWindow: (w) => `Listo. Solicité ${w}. La oficina confirma por teléfono la hora exacta de llegada.`,
      sentCallback: (phone, w) => `Listo. La oficina le llamará al ${phone} ${w}.`,
      sentClosed: 'La oficina abre a las 8 a. m. del siguiente día hábil.',
      sentEmergency: (phone) => `Listo. El técnico de guardia tiene sus datos y le llamará al ${phone}. Si necesita ayuda más rápido, llame al ${TEL}.`,
      doneChips: ['Hacer una pregunta', 'Nueva solicitud'],
      askAnything: 'Adelante, ¿qué le gustaría saber?',
      fallbackDone: `Lo anoté para el equipo. Si es urgente, llame al ${TEL}.`,
      unknownQ: 'No tengo esa respuesta aquí, así que anoté su pregunta para el equipo.',
      human: `Puede comunicarse con el equipo al ${TEL}. El horario de oficina es de lunes a viernes, de 8 a. m. a 5 p. m., y hay un técnico de guardia las 24 horas para emergencias. También puedo tomar sus datos aquí.`,
      thanks: 'De nada. Que esté cómodo en casa.',
      faq: {
        price: 'No puedo dar precios por chat. Un técnico le confirma el precio antes de comenzar cualquier trabajo.',
        priceMore: 'Puedo iniciar su solicitud para que lo haga.',
        hours: 'El horario de oficina es de lunes a viernes, de 8 a. m. a 5 p. m. Hay un técnico de guardia las 24 horas, sujeto a disponibilidad.',
        emergency: `Sí, hay un técnico de guardia las 24 horas, sujeto a disponibilidad. Fuera de horario, las reparaciones se limitan a las piezas que lleva el camión y se cobra un cargo adicional; el técnico confirma los detalles. Si es una emergencia, llame al ${TEL}.`,
        area: 'Atendemos el sureste de Houston y el condado de Galveston: Pasadena, Deer Park, La Porte, Pearland, League City, Friendswood, Baytown, Galveston y más, y ahora The Woodlands. Envíeme su dirección y un miembro del equipo lo confirmará.',
        services: 'Para casas: aire acondicionado, revisiones de aire acondicionado, calefacción, bombas de calor, mini-splits sin ductos, ductos y calidad del aire interior. También instalamos, reparamos y damos mantenimiento a sistemas comerciales.',
        financing: 'Sí, hay opciones flexibles de financiamiento para instalaciones nuevas y reparaciones mayores. Un miembro del equipo se las explicará.',
        license: 'Sí. Los técnicos tienen licencia y seguro, y todos los empleados pasan una verificación de antecedentes. Licencia de Texas TACLA971E.',
        location: 'La oficina está en 2727 Beverly Road, Pasadena, TX 77503. Casi todo el trabajo se hace en su casa, así que llame antes de visitar la oficina.',
        frequency: 'Al menos una vez al año: el aire acondicionado antes del verano y la calefacción antes del invierno.',
        plan: 'Sí. El Service Agreement de Brown es un programa de mantenimiento preventivo: los técnicos limpian, inspeccionan y ajustan sus sistemas antes de cada temporada.',
        brands: 'Damos servicio a todas las marcas y modelos, e instalamos marcas con un historial comprobado de confiabilidad. Un técnico puede recomendarle la mejor opción.',
        warranty: 'Sí, podemos reparar y dar servicio a su sistema aunque ya no tenga garantía.',
        commercial: 'Sí, instalamos, reparamos y damos mantenimiento a sistemas comerciales.',
        lifespan: 'La mayoría de los sistemas de aire acondicionado duran de 10 a 15 años con el mantenimiento adecuado.',
        careers: 'Estamos contratando. Vea la <a href="/mockups/brown-air-and-heat/careers/">página de empleo</a> para postularse.',
        spanish: 'Sí, puedo ayudarle en español.',
      },
    },
  };

  /* ---------------------------------------------------------- matching */

  const RX = {
    // JavaScript's \b is ASCII-only, so words that can end in an accented letter use a lookahead instead.
    es: /[¿¡ñáéíóú]|\b(hola|buenas|buenos|gracias|por favor|necesito|quiero|tengo|aire|ayuda|urgente|hoy|precio|cuesta|habla|ruido|fuga|gotea|agua|mantenimiento|llamen|huele|omitir|enviar|empezar|solicitar|sin prisa|esta semana|emergencia|otra cosa|no calienta|no funciona|no prende|no sirve|me llamo|soy)(?![a-z])|\b(calefacci|calent[oa]|cotizaci|espanol|no enfr)/i,
    en: /\b(the|my|is|isn't|it's|not|please|hello|hi|need|have|and|yes|what|how|thanks|thank|call|back|window|skip|send|start|morning|afternoon|today|tomorrow|week|rush|cooling|heat|noise|leak)\b/i,
    greeting: /^(hi|hello|hey|good (morning|afternoon|evening)|hola|buenas|buenos d[ií]as|buenas (tardes|noches))[\s!.,]*$/i,
    question: /[?¿]|^(how|what|when|where|why|who|which|do|does|can|could|is|are|will|would|should)\b|^(c[oó]mo|qu[eé]|cu[aá]ndo|d[oó]nde|por qu[eé]|qui[eé]n|cu[aá]l|cu[aá]nto|tienen|hacen|pueden|puedo|atienden|aceptan|ofrecen|hay)(?![a-zñáéíóú])/i,
    gas: /(smell|smells|smelling|odor|odour|leak|leaking)\b.{0,24}\bgas\b|\bgas\b.{0,24}\b(smell|odor|odour|leak)|rotten egg|carbon monoxide|\bco (alarm|detector)|huele a gas|olor a gas|fuga de gas|mon[oó]xido|huevo podrido/i,
    human: /\b(human|real person|representative|operator|live agent|(speak|talk) (to|with) (a |an )?(someone|somebody|person|human|agent|representative|technician))\b|persona real|un humano|hablar con (alguien|una persona|un agente|un t[eé]cnico)/i,
    restart: /^(start over|restart|start a new request|new request|empezar de nuevo|nueva solicitud|reiniciar)[\s.!]*$/i,
    thanks: /^(thanks|thank you|thx|ty|ok thanks|great,? thanks|gracias|muchas gracias|bye|goodbye|adi[oó]s)[\s.!]*$/i,
    yes: /^(yes|yep|yeah|yup|correct|right|send|sure|looks good|that'?s right|ok|okay|s[ií](?![a-zñáéíóú])|correcto|enviar|env[ií]a|est[aá] bien|as[ií] es)/i,
    no: /^(no\b|nope|wrong|incorrect|start over|change|cambiar|empezar|incorrecto)/i,
    skip: /^(skip|no|none|nothing|nope|n\/a|omitir|nada|ninguno|ninguna)[\s.!]*$/i,
    nameLead: /^(my name is|my name's|i am|i'm|im|this is|it's|its|me llamo|mi nombre es|soy|habla)\s+/i,
  };

  const ISSUES = [
    ['quote', /new (system|unit|ac|a\/c|air conditioner|furnace|heat pump)|replac|install|\bquote\b|estimate|sistema nuevo|unidad nueva|reemplaz|instalaci|instalar|cotizaci|presupuesto/i],
    ['maint', /mainten|tune.?up|check.?up|inspection|service agreement|mantenimiento|revisi[oó]n|afinaci/i],
    ['leak', /leak|drip|water|puddle|fuga|gote|agua|charco/i],
    ['noise', /nois|loud|rattl|bang|buzz|squeal|grind|humming|ruido|suena|zumb/i],
    ['heat', /no heat|not heating|heater|furnace|blowing cold|won'?t heat|isn'?t heating|no calienta|sin calefacci|calefacci|calent[oó]n|calentador|aire fr[ií]o/i],
    ['cool', /no cool|not cool|warm air|hot air|won'?t cool|isn'?t cool|\ba\/?c\b|air ?condition|no enfr[ií]a|aire caliente|aire acondicionado|\bclima\b|too hot|hot in/i],
  ];

  const URGENCY = [
    ['emergency', /emergenc|right now|help now|asap|urgent|immediately|\bahora\b|urgente|ayuda ya|ya mismo|de inmediato/i],
    ['soon', /today|tonight|tomorrow|\bhoy\b|esta noche|ma[ñn]ana/i],
    ['week', /this week|few days|esta semana|unos d[ií]as/i],
    ['flexible', /no rush|planning|flexible|whenever|not urgent|sin prisa|cuando puedan|no es urgente/i],
  ];

  const FAQ = [
    ['price', /\b(price|prices|pricing|cost|costs|how much|fee|fees|ballpark|charge|charges|rate|rates)\b|\$\s?\d|cu[aá]nto (cuesta|cobran|sale|es|vale|me)|\b(precio|precios|costo|costos|cobran|tarifa|tarifas)\b/i],
    ['emergency', /24.?7|24 hours|after.?hours|emergency service|\b(weekends?|nights?|holidays?|sunday|saturday)\b|fuera de horario|fines? de semana|24 horas|de guardia/i],
    ['hours', /\b(hours|what time|open|opens|close|closes|closed)\b|horario|\b(abren|cierran|abierto)\b/i],
    ['financing', /financ|payment plan|monthly payment|\bpagos\b|cr[eé]dito/i],
    ['license', /licen[sc]|insured|insurance|background check|certified|asegurad|antecedentes|certificad/i],
    ['frequency', /how often|once a year|every year|cada cu[aá]nto|con qu[eé] frecuencia/i],
    ['plan', /maintenance plan|service agreement|membership|plan de mantenimiento|membres[ií]a/i],
    ['warranty', /warrant|garant[ií]a/i],
    ['lifespan', /how long.{0,30}last|lifespan|life expectancy|cu[aá]nto dura/i],
    ['careers', /\b(hiring|jobs?|careers?|employment)\b|contratando|\bempleo\b|vacante/i],
    ['commercial', /commercial|\b(business|rooftop|rtu|restaurant)\b|comercial|negocio/i],
    ['brands', /\b(brands?|makes|models?)\b|\b(marcas?|modelos?)\b/i],
    ['location', /where are you|\b(located|location|office)\b|your address|d[oó]nde est[aá]n|ubicad|oficina/i],
    ['area', /service area|\b(areas?|serve|cover)\b|do you (service|come|go)|atienden|cubren|llegan|\bzona\b|[aá]rea de servicio/i],
    ['services', /\bservices\b|what do you (do|offer|fix)|do you (fix|repair|install|work on)|servicios|qu[eé] (hacen|ofrecen|reparan)/i],
    ['spanish', /spanish|espa[ñn]ol/i],
  ];

  const PRICE_STRONG = /\b(price|prices|pricing|cost|costs|how much|fee|fees|ballpark)\b|\$\s?\d|cu[aá]nto (cuesta|cobran|sale|es|vale|me)|\b(precio|precios|costo|costos|tarifa|tarifas)\b/i;

  const firstMatch = (table, text) => { for (const [key, rx] of table) if (rx.test(text)) return key; return null; };

  /* ------------------------------------------------------------ helpers */

  function isOfficeOpen(now) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type).value;
    const hour = Number(get('hour'));
    return !['Sat', 'Sun'].includes(get('weekday')) && hour >= 8 && hour < 17;
  }

  function windowOptions(s) {
    const t = T[s.lang];
    const locale = s.lang === 'es' ? 'es-US' : 'en-US';
    const days = [];
    const d = new Date(s.now.getTime());
    while (days.length < 2) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(new Date(d.getTime()));
    }
    const options = [];
    days.forEach((day) => {
      const label = day.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
      ['am', 'pm'].forEach((part) => options.push({ chip: `${label} · ${t.parts[part]}`, long: `${label}, ${t.partLong[part]}`, part }));
    });
    options.push({ chip: t.firstAvail, long: t.firstAvailLong, part: 'any' });
    return options;
  }

  const first = (s) => esc((s.lead.name || '').split(/\s+/)[0]);
  const bot = (html) => ({ kind: 'bot', html });

  function requestLine(s, lang) {
    const t = T[lang];
    const L = s.lead;
    if (L.emergency) return t.reqOnCall;
    if (L.mode === 'window') return t.reqWindow(lang === s.lang ? L.windowLong : L.windowLongEn);
    return t.reqCallback(t.callbackLabel[L.callback] || esc(L.callbackText || ''));
  }

  function customerSummary(s) {
    const t = T[s.lang];
    const L = s.lead;
    const lines = [
      `${t.issueLabel[L.issue]}${L.issue === 'other' && L.issueText ? `: ${esc(L.issueText)}` : ''} · ${t.urgencyLabel[L.urgency]}`,
      `${esc(L.name)}, ${esc(L.phone)}`,
      esc(L.address),
      requestLine(s, s.lang),
    ];
    if (L.notes) lines.push(esc(L.notes));
    return `${t.summaryIntro}\n${lines.map((l) => `• ${l}`).join('\n')}`;
  }

  // Always in English: this is what the owner and the on-call technician read.
  function ownerSummary(s) {
    const t = T.en;
    const L = s.lead;
    const received = s.now.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const rows = [
      ['Name', esc(L.name)],
      ['Phone', esc(L.phone)],
      ['Address', esc(L.address)],
      ['Area', L.areaCity ? `${L.areaCity}, in the service area` : 'To confirm'],
      ['Issue', t.issueLabel[L.issue] + (L.issueText ? `: ${esc(L.issueText)}` : '')],
      ['Urgency', t.urgencyLabel[L.urgency]],
      ['Request', requestLine(s, 'en')],
    ];
    if (L.notes) rows.push(['Notes', esc(L.notes)]);
    if (L.questions.length) rows.push(['Asked', L.questions.map(esc).join(' | ')]);
    rows.push(['Language', s.lang === 'es' ? 'Spanish' : 'English']);
    rows.push(['Received', `${received} CT${s.simulated ? ' (office status simulated for this demo)' : ''}`]);
    const head = `<b>NEW LEAD · WEBSITE CHAT · ${s.afterHours ? 'AFTER HOURS' : 'OFFICE HOURS'}</b>` +
      (L.gas ? '\n<b>GAS / CO SAFETY MESSAGE GIVEN: CUSTOMER TOLD TO LEAVE AND CALL 911</b>' : '') +
      (L.emergency ? '\n<b>EMERGENCY, ON-CALL FLAGGED</b>' : '');
    const to = L.emergency ? `Email to the on-call technician and ${EMAIL}` : `Email to ${EMAIL}`;
    return `${head}\n\n${rows.map(([k, v]) => `${k.padEnd(9)} ${v}`).join('\n')}\n\n→ ${to}`;
  }

  /* -------------------------------------------------------------- engine */

  function createSession(opts) {
    const o = opts || {};
    const now = o.now || new Date();
    const reallyClosed = !isOfficeOpen(now);
    return {
      lang: o.lang === 'es' ? 'es' : 'en',
      now,
      afterHours: typeof o.afterHours === 'boolean' ? o.afterHours : reallyClosed,
      simulated: typeof o.afterHours === 'boolean' && o.afterHours !== reallyClosed,
      step: 'issue',
      chips: [],
      lead: { questions: [] },
    };
  }

  function ask(s) {
    const t = T[s.lang];
    switch (s.step) {
      case 'issue': return [t.askIssue, t.issues];
      case 'urgency': return [t.askUrgency, t.urgencies];
      case 'name': return [t.askName, []];
      case 'phone': return [t.askPhone(first(s)), []];
      case 'address': return [t.askAddress, []];
      case 'mode': return [t.askMode, t.modes];
      case 'window': return [t.askWindow, windowOptions(s).map((w) => w.chip)];
      case 'callback': return [t.askCallback, t.callbacks];
      case 'notes': return [t.askNotes, [t.skip]];
      case 'confirm': return [`${customerSummary(s)}\n\n${t.confirmAsk}`, t.confirmChips];
      default: return [null, t.doneChips];
    }
  }

  function finish(s, msgs) {
    const [question, chips] = ask(s);
    if (question) msgs.push(bot(question));
    s.chips = chips;
    return { messages: msgs, chips };
  }

  function start(s, lead) {
    s.step = 'issue';
    s.sent = false;
    s.lead = { questions: [] };
    const t = T[s.lang];
    const msgs = lead ? [bot(lead)] : [];
    msgs.push(bot(s.afterHours ? t.greetClosed : t.greetOpen));
    return finish(s, msgs);
  }

  // After an interruption (gas alert), continue from the first detail we still need.
  function nextMissing(s) {
    const L = s.lead;
    if (!L.name) return 'name';
    if (!L.phone) return 'phone';
    if (!L.address) return 'address';
    return L.emergency ? 'notes' : 'mode';
  }

  function setIssue(s, key, text, msgs) {
    const t = T[s.lang];
    s.lead.issue = key;
    if (key === 'other') s.lead.issueText = text.slice(0, 200);
    msgs.push(bot(t.ack[key]));
    if (key === 'maint' || key === 'quote') { s.lead.urgency = 'routine'; s.step = 'name'; } else s.step = 'urgency';
  }

  const HANDLERS = {
    issue(s, text, msgs) {
      const t = T[s.lang];
      if (RX.greeting.test(text)) { msgs.push(bot(t.hello)); return true; }
      const chip = t.issues.findIndex((c) => c.toLowerCase() === text.toLowerCase());
      let key = chip === t.issues.length - 1 ? 'other' : firstMatch(ISSUES, text);
      if (!key) { if (text.length < 4) return false; key = 'other'; }
      setIssue(s, key, chip === t.issues.length - 1 ? '' : text, msgs);
      return true;
    },
    urgency(s, text, msgs) {
      const t = T[s.lang];
      const key = firstMatch(URGENCY, text);
      if (!key) return false;
      s.lead.urgency = key;
      if (key === 'emergency') {
        s.lead.emergency = true;
        if (s.lead.issue === 'cool') msgs.push({ kind: 'alert', html: t.emergCool });
        else if (s.lead.issue === 'heat') msgs.push({ kind: 'alert', html: t.emergHeat });
        else msgs.push(bot(t.emergOther));
        if (s.afterHours) msgs.push(bot(t.onCallTerms));
      }
      s.step = nextMissing(s);
      return true;
    },
    name(s, text) {
      const name = text.replace(RX.nameLead, '').replace(/[.!,]+$/, '').trim();
      if (name.length < 2 || name.length > 60 || /\d/.test(name) || name.split(/\s+/).length > 5 || !/[a-zA-Záéíóúñü]/i.test(name)) return false;
      s.lead.name = name;
      s.step = nextMissing(s);
      return true;
    },
    phone(s, text) {
      const d = text.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (d.length !== 10) return false;
      s.lead.phone = `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
      s.step = nextMissing(s);
      return true;
    },
    address(s, text, msgs) {
      const t = T[s.lang];
      const low = text.toLowerCase();
      const area = AREAS.find(([needle]) => low.includes(needle));
      if (text.length < 5 || (!/\d/.test(text) && !area)) return false;
      s.lead.address = text.slice(0, 160);
      s.lead.areaCity = area ? area[1] : '';
      msgs.push(bot(area ? t.areaYes(area[1]) : t.areaMaybe));
      s.step = nextMissing(s);
      return true;
    },
    mode(s, text) {
      if (/call ?me|call ?back|callback|ll[aá]m|llamada/i.test(text)) { s.lead.mode = 'callback'; s.step = 'callback'; return true; }
      if (/window|appointment|book|schedule|visit|morning|afternoon|tomorrow|horario|cita|agendar|programar|visita|ma[ñn]ana|tarde/i.test(text)) { s.lead.mode = 'window'; s.step = 'window'; return true; }
      return false;
    },
    window(s, text) {
      const options = windowOptions(s);
      const low = text.toLowerCase();
      let i = options.findIndex((w) => w.chip.toLowerCase() === low);
      if (i < 0) {
        if (/first|any|asap|soon|primer|cualquier|lo antes/i.test(text)) i = options.length - 1;
        else if (/afternoon|\bpm\b|tarde/i.test(text)) i = 1;
        else if (/morning|\bam\b|por la ma[ñn]ana|temprano/i.test(text)) i = 0;
      }
      if (i < 0) return false;
      const other = windowOptions({ lang: 'en', now: s.now });
      s.lead.windowLong = options[i].long;
      s.lead.windowLongEn = other[i].long;
      s.step = 'notes';
      return true;
    },
    callback(s, text) {
      if (/soon|asap|now|first|lo antes|ya\b|ahora/i.test(text)) s.lead.callback = 'asap';
      else if (/afternoon|\bpm\b|tarde/i.test(text)) s.lead.callback = 'pm';
      else if (/morning|\bam\b|ma[ñn]ana|temprano/i.test(text)) s.lead.callback = 'am';
      else { s.lead.callback = 'other'; s.lead.callbackText = text.slice(0, 80); }
      s.step = 'notes';
      return true;
    },
    notes(s, text) {
      s.lead.notes = RX.skip.test(text) ? '' : text.slice(0, 300);
      s.step = 'confirm';
      return true;
    },
    confirm(s, text, msgs) {
      const t = T[s.lang];
      const L = s.lead;
      if (RX.no.test(text)) return 'restart';
      if (!RX.yes.test(text)) return false;
      if (L.emergency) msgs.push(bot(t.sentEmergency(esc(L.phone))));
      else if (L.mode === 'window') msgs.push(bot(t.sentWindow(L.windowLong) + (s.afterHours ? ` ${t.sentClosed}` : '')));
      else msgs.push(bot(t.sentCallback(esc(L.phone), t.callbackLabel[L.callback] || esc(L.callbackText)) + (s.afterHours ? ` ${t.sentClosed}` : '')));
      msgs.push({ kind: 'note', html: 'Demo: nothing was sent. In the live version this summary goes to the owner by email, and the request lands on the schedule:' });
      msgs.push({ kind: 'owner', html: ownerSummary(s) });
      s.sent = true;
      s.step = 'done';
      return true;
    },
    done(s, text, msgs) {
      const t = T[s.lang];
      const issue = firstMatch(ISSUES, text);
      if (issue) {
        // A new problem after a finished request: open a second request and keep the contact details.
        const { name, phone, address, areaCity } = s.lead;
        s.lead = { questions: [], name, phone, address, areaCity };
        s.sent = false;
        setIssue(s, issue, text, msgs);
        if (s.step === 'name') s.step = nextMissing(s);
        return true;
      }
      if (text.toLowerCase() === t.doneChips[0].toLowerCase()) msgs.push(bot(t.askAnything));
      else if (RX.thanks.test(text)) msgs.push(bot(t.thanks));
      else { s.lead.questions.push(text.slice(0, 200)); msgs.push(bot(t.fallbackDone)); }
      return true;
    },
  };

  const LANG_STEPS = new Set(['issue', 'urgency', 'mode', 'window', 'callback', 'notes', 'confirm', 'done']);
  const PRICE_STEPS = new Set(['issue', 'urgency', 'mode', 'window', 'callback', 'notes', 'confirm', 'done']);
  const REPROMPT = { name: 'badName', phone: 'badPhone', address: 'badAddress' };

  function reply(s, raw) {
    const text = String(raw == null ? '' : raw).trim().slice(0, 500);
    if (!text) return { messages: [], chips: s.chips };
    const msgs = [];

    // 1. Language. Auto-detect only on steps where the answer is a sentence, not a name or an address.
    const wantsEs = /\bespa[ñn]ol\b|\bspanish\b/i.test(text);
    const wantsEn = /\benglish\b|\bingl[eé]s\b/i.test(text);
    if (s.lang === 'en' && (wantsEs || (LANG_STEPS.has(s.step) && RX.es.test(text)))) { s.lang = 'es'; msgs.push(bot(T.es.switched)); }
    else if (s.lang === 'es' && (wantsEn || (LANG_STEPS.has(s.step) && RX.en.test(text) && !RX.es.test(text)))) { s.lang = 'en'; msgs.push(bot(T.en.switched)); }
    const t = T[s.lang];
    if ((wantsEs || wantsEn) && text.split(/\s+/).length <= 4) return finish(s, msgs);

    // 2. Safety first, whatever step we are on.
    if (RX.gas.test(text)) {
      s.lead.gas = true;
      s.lead.emergency = true;
      s.lead.urgency = 'emergency';
      if (!s.lead.issue) s.lead.issue = 'gas';
      msgs.push({ kind: 'alert', html: t.gasAlert });
      msgs.push(bot(t.gasFollow));
      s.step = s.sent ? 'done' : nextMissing(s);
      return finish(s, msgs);
    }

    if (RX.restart.test(text)) return start(s, t.restart);
    if (RX.human.test(text)) { msgs.push(bot(t.human)); return finish(s, msgs); }

    // 3. Questions. Prices are deflected on every step where free text is expected.
    const questionish = RX.question.test(text);
    let faqKey = null;
    if (questionish) faqKey = firstMatch(FAQ, text);
    else if (PRICE_STEPS.has(s.step) && PRICE_STRONG.test(text)) faqKey = 'price';

    if (faqKey) {
      s.lead.questions.push(text.slice(0, 200));
      msgs.push(bot(t.faq[faqKey] + (faqKey === 'price' && !s.sent ? ` ${t.faq.priceMore}` : '')));
      if (s.step === 'issue') {
        const key = firstMatch(ISSUES, text);
        if (key) setIssue(s, key, text, msgs);
      }
      return finish(s, msgs);
    }

    // 4. The step's own answer. A question we can't answer is never swallowed as a name, an address or an issue.
    const unanswerable = questionish && (s.step === 'name' || s.step === 'address' || (s.step === 'issue' && !firstMatch(ISSUES, text)));
    const result = unanswerable ? false : HANDLERS[s.step](s, text, msgs);
    if (result === 'restart') return start(s, t.restart);
    if (result) return finish(s, msgs);

    // 5. Not understood: say so plainly and ask again.
    if (questionish) { s.lead.questions.push(text.slice(0, 200)); msgs.push(bot(t.unknownQ)); return finish(s, msgs); }
    if (REPROMPT[s.step]) { msgs.push(bot(t[REPROMPT[s.step]])); s.chips = []; return { messages: msgs, chips: [] }; }
    return finish(s, msgs);
  }

  function setLanguage(s, lang) {
    s.lang = lang === 'es' ? 'es' : 'en';
    return finish(s, [bot(T[s.lang].switched)]);
  }

  return { createSession, start, reply, setLanguage, ownerSummary, isOfficeOpen, PHONE, TEL_HREF };
}));

/* ======================================================================
   Part 2 — the widget. Skipped entirely outside a browser.
   ====================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const Engine = window.BrownFrontDeskEngine;

  const el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v; // engine-authored markup only; user input is escaped in the engine
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.append(c));
    return node;
  };
  const icon = (d) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

  const launch = el('button', { class: 'btn btn--book fd-launch', type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Message us: open the front desk chat', html: `${icon('M4 5h16v11H9l-5 4z')}<span>Message us</span>` });

  const langBtn = el('button', { class: 'fd-head__btn', type: 'button', text: 'Español' });
  const closeBtn = el('button', { class: 'fd-head__btn', type: 'button', 'aria-label': 'Close chat', html: icon('M6 6l12 12M18 6L6 18') });
  const demoText = el('span', { text: 'Demo, nothing is sent.' });
  const demoBtn = el('button', { type: 'button', text: 'Simulate closed' });
  const log = el('div', { class: 'fd-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' });
  const input = el('input', { class: 'input', id: 'fd-input', type: 'text', autocomplete: 'off', enterkeyhint: 'send', maxlength: '500', placeholder: 'Type a message' });
  const form = el('form', { class: 'fd-form' }, [
    el('label', { class: 'visually-hidden', for: 'fd-input', text: 'Message' }),
    input,
    el('button', { class: 'btn btn--book', type: 'submit', text: 'Send' }),
  ]);
  const panel = el('section', { class: 'fd-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Brown Air front desk chat', hidden: '' }, [
    el('header', { class: 'fd-head' }, [
      el('div', { class: 'fd-head__title' }, [el('strong', { text: 'Brown Air front desk' }), el('span', { text: 'Virtual assistant · answers 24/7' })]),
      langBtn,
      closeBtn,
    ]),
    el('div', { class: 'fd-demo' }, [demoText, demoBtn]),
    log,
    form,
  ]);
  document.body.append(launch, panel);

  let session = null;
  let chipRow = null;
  let pending = 0;

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  function syncChrome() {
    langBtn.textContent = session.lang === 'es' ? 'English' : 'Español';
    input.placeholder = session.lang === 'es' ? 'Escriba un mensaje' : 'Type a message';
    demoText.textContent = `Demo, nothing is sent. Office simulated as ${session.afterHours ? 'closed' : 'open'}.`;
    demoBtn.textContent = session.afterHours ? 'Simulate open' : 'Simulate closed';
  }

  function render(result) {
    if (chipRow) { chipRow.remove(); chipRow = null; }
    result.messages.forEach((m) => log.append(el('div', { class: `fd-msg fd-msg--${m.kind}`, html: m.html })));
    if (result.chips.length) {
      chipRow = el('div', { class: 'fd-chips' }, result.chips.map((label) => el('button', { class: 'chip', type: 'button', text: label })));
      log.append(chipRow);
    }
    syncChrome();
    scrollDown();
  }

  function begin(afterHours) {
    session = Engine.createSession(typeof afterHours === 'boolean' ? { afterHours } : {});
    log.replaceChildren();
    chipRow = null;
    render(Engine.start(session));
  }

  function send(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (chipRow) { chipRow.remove(); chipRow = null; }
    log.append(el('div', { class: 'fd-msg fd-msg--user', text: value }));
    const typing = el('div', { class: 'fd-typing', text: '…' });
    log.append(typing);
    scrollDown();
    const result = Engine.reply(session, value);
    pending += 1;
    window.setTimeout(() => {
      typing.remove();
      render(result);
      pending -= 1;
    }, 350);
  }

  // opts.fresh starts a new conversation (used by the "try one of these" buttons on the page).
  function open(text, opts) {
    if (!session) begin();
    else if (opts && opts.fresh) begin(session.simulated ? session.afterHours : undefined);
    panel.hidden = false;
    launch.hidden = true;
    scrollDown();
    if (text) send(text);
    else input.focus({ preventScroll: true });
  }

  function close() {
    panel.hidden = true;
    launch.hidden = false;
    launch.focus({ preventScroll: true });
  }

  launch.addEventListener('click', () => open());
  closeBtn.addEventListener('click', close);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (pending) return;
    send(input.value);
    input.value = '';
  });
  log.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && !pending) send(chip.textContent);
  });
  langBtn.addEventListener('click', () => render(Engine.setLanguage(session, session.lang === 'es' ? 'en' : 'es')));
  demoBtn.addEventListener('click', () => begin(!session.afterHours));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  window.BrownFrontDesk = { open, close };
}());
