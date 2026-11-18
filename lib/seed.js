import { formatLocal } from './time.js';

/* Évènements de démonstration : fictifs, mais placés autour de la date du jour
   pour que l'agenda soit lisible dès le premier lancement. */

function at(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return formatLocal(date);
}

export function makeDemoEvents() {
  const now = Date.now();
  const base = (id, offset) => ({
    id,
    createdAt: now - offset,
    updatedAt: now - offset,
    source: 'seed',
  });

  return [
    {
      ...base('evt_demo_prompt', 5 * 3600 * 1000),
      title: 'Atelier prompt engineering',
      description:
        'Apprendre à écrire des prompts efficaces pour ses projets : cadrage, exemples, itérations et vérification des réponses. Apporte ton ordinateur — atelier 100 % pratique.',
      location: 'Oreegami — Campus Port Marianne',
      category: 'Atelier',
      organizer: 'Oreegami Montpellier',
      url: '',
      allDay: false,
      start: at(2, 18, 0),
      end: at(2, 20, 0),
    },
    {
      ...base('evt_demo_meetup', 12 * 3600 * 1000),
      title: 'Meetup IA & startups',
      description:
        'Trois retours d’expérience de fondateurs et de développeurs qui utilisent l’IA au quotidien. Échanges libres et apéro networking à la fin.',
      location: 'Le Village by CA Montpellier',
      category: 'Meetup',
      organizer: 'Communauté IA Montpellier',
      url: '',
      allDay: false,
      start: at(4, 19, 0),
      end: at(4, 21, 0),
    },
    {
      ...base('evt_demo_rag', 20 * 3600 * 1000),
      title: 'Atelier RAG avec des données locales',
      description:
        'Construire un petit moteur de recherche augmenté (RAG) sur des documents locaux : découpage, embeddings, recherche et génération. Niveau intermédiaire.',
      location: 'Oreegami — Lab IA',
      category: 'Atelier',
      organizer: 'Étudiants Oreegami',
      url: '',
      allDay: false,
      start: at(6, 18, 0),
      end: at(6, 20, 0),
    },
    {
      ...base('evt_demo_hackathon', 2 * 86400 * 1000),
      title: 'Hackathon GenAI — 24 h pour coder',
      description:
        'Une journée et une nuit pour prototyper un produit utile avec l’IA. Équipes de 3 à 5 personnes, mentors sur place, démo devant un jury en fin de journée.',
      location: 'Oreegami Montpellier',
      category: 'Hackathon',
      organizer: 'Oreegami',
      url: '',
      allDay: false,
      start: at(9, 9, 0),
      end: at(9, 18, 0),
    },
    {
      ...base('evt_demo_conference', 3 * 86400 * 1000),
      title: 'Conférence : IA responsable',
      description:
        'Biais, transparence, impact environnemental : comment concevoir des produits IA plus sobres et plus justes. Conférence ouverte à tous les étudiants.',
      location: 'MO.CO. Panacée — Montpellier',
      category: 'Conférence',
      organizer: 'Oreegami & partenaires',
      url: '',
      allDay: false,
      start: at(13, 17, 30),
      end: at(13, 19, 0),
    },
    {
      ...base('evt_demo_past', 6 * 86400 * 1000),
      title: 'Café IA des étudiants',
      description:
        'Un café, des questions, des projets. Rendez-vous informel pour échanger sur les cours, les stages et les projets IA du campus.',
      location: 'Halle Tropisme — Montpellier',
      category: 'Meetup',
      organizer: 'Bureau des étudiants',
      url: '',
      allDay: false,
      start: at(-6, 12, 30),
      end: at(-6, 13, 30),
    },
  ];
}
