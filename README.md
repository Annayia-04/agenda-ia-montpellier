# Agenda IA Montpellier — Oreegami

Un agenda partagé, sans dépendance, pour les évènements IA à Montpellier destinés aux
étudiants d’Oreegami : ateliers, meetups, hackathons, conférences.

- **Formulaire public ultra simple** : un titre, une date, un lieu, et c’est publié.
- **Page embed** prête à intégrer dans un CRM ou un site via une iframe.
- **Export iCalendar** : chaque évènement est téléchargeable en `.ics`, et un flux global
  permet de s’abonner depuis Google Agenda, Apple Calendar ou Outlook.
- **Édition par navigateur** : l’évènement créé est modifiable/supprimable depuis le
  navigateur qui l’a publié.
- **Modération par jeton** : un jeton admin permet de corriger ou supprimer n’importe quel
  évènement.
- **Zéro dépendance** : Node.js 18+ suffit. Les données vivent dans un simple fichier JSON.

```bash
npm start
# → http://127.0.0.1:4500
```

Pour charger un fichier `.env` avec Node 20+ : `node --env-file=.env server.js`.

---

## Ce que fait l’application

### 1. Agenda public

- Vue **calendrier mensuel** (semaine commençant le lundi) et vue **liste**.
- Filtres par catégorie : Atelier, Conférence, Hackathon, Meetup, Autre.
- Évènements à venir, évènements passés, recherche visuelle par jour.
- Mise à jour automatique toutes les 30 secondes (et au retour sur l’onglet), sans
  interrompre un formulaire ouvert.
- Chaque évènement a une fiche : horaire, lieu, organisateur, description, lien
  d’inscription, bouton **Ajouter à mon agenda**.

### 2. Formulaire de proposition

Le formulaire demande le minimum : titre, date, heure, lieu, catégorie. Les champs
description, lien d’inscription et organisateur sont repliés dans
« Détails complémentaires (optionnel) ».

- Évènements sur une journée entière pris en charge.
- Validation côté serveur (titre obligatoire, dates cohérentes, longueurs maximales).
- Champ piège anti-robots + limitation de débit par IP (8 propositions / 10 minutes par
  défaut).
- Publication immédiate : pas de file d’attente de validation.
- **Édition en autonomie** : le navigateur qui crée l’évènement reçoit un jeton d’édition
  local et peut ensuite le modifier ou le supprimer, sans connaître le jeton admin.

### 3. Modification & modération

Deux niveaux de droits :

- **Créateur** : le navigateur qui a publié un évènement reçoit un jeton d’édition
  (192 bits) au moment de la création. Il est conservé dans `localStorage` et permet de
  modifier ou supprimer **cet évènement uniquement**, depuis ce navigateur.
- **Modération** : le jeton défini par `AGENDA_ADMIN_TOKEN` permet de modifier ou
  supprimer **tous** les évènements. S’il n’est pas fourni, un jeton aléatoire est généré
  au démarrage et affiché dans la console.

Le lien **Modération** en pied de page déverrouille le mode admin. Le jeton est conservé
dans `sessionStorage` (il disparaît à la fermeture de l’onglet). Les routes d’écriture
exigent `X-Admin-Token` ou, pour le créateur, `X-Edit-Token`. Le hash du jeton d’édition
est stocké côté serveur et n’est jamais renvoyé par l’API.

Si le navigateur est vidé ou change d’appareil, le créateur perd son accès : la
modération peut alors prendre le relais.

### 4. Intégration CRM

La page `/embed` est autonome, sans navigation globale, pensée pour une iframe :

```html
<iframe
  src="https://agenda.example.com/embed"
  width="100%"
  height="640"
  style="border:0;border-radius:16px;max-width:100%"
  title="Agenda IA Montpellier — Oreegami"
  loading="lazy"
></iframe>
```

- L’URL accepte `?theme=light` ou `?theme=dark`.
- Le bouton « Ouvrir l’agenda complet » pointe vers `/`.
- Pour restreindre les domaines autorisés à afficher l’iframe, configurez
  `AGENDA_EMBED_ORIGINS` (voir plus bas).
- Le CRM peut aussi consommer directement `GET /api/events` (JSON, CORS ouvert par défaut).

### 5. Agenda personnel / abonnement

| Besoin | URL |
| --- | --- |
| Ajouter **un** évènement | `/events/<id>.ics` |
| Télécharger **tout** l’agenda | `/events.ics` |
| S’abonner aux évènements **à venir** | `/events.ics?upcoming=1` |

Le fichier `.ics` est conforme à la RFC 5545 : heures converties en UTC depuis
`Europe/Paris` (heure d’été gérée), échappement des textes, lignes repliées à 75 octets,
`UID` stable par évènement.

**Google Agenda** : Autres agendas → S’abonner à un agenda → coller l’URL du flux.
**Apple Calendar** : Fichier → Nouvel abonnement à un calendrier → coller l’URL.
**Outlook** : Ajouter un calendrier → S’abonner à partir du web → coller l’URL.

Le bouton `.ics` de chaque carte force le téléchargement d’un évènement seul, ce qui
fonctionne aussi sans abonnement.

### 6. Direction artistique

L’interface reprend les codes du site **oreegami.com** :

- bleu Oreegami `#0000E6` pour le header, le footer et les blocs forts ;
- bleu secondaire `#2A45D1`, vert `#008E60`, jaune `#FFD12D`, corail `#FF4C53` et rouge
  `#EE4141` ;
- texte `#3C3C3B` sur fond `#F7F7F7` ;
- typographie **Inter** (avec repli système), titres très gras et interlignes serrés ;
- boutons pilule, cartes arrondies 20 px, ombre douce `0 10px 30px rgba(0,0,0,.12)` ;
- logo et favicon officiels Oreegami.

Le thème sombre reste disponible via le bouton lune/soleil.

---

## Configuration

Toutes les variables sont optionnelles.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `4500` | Port HTTP ( `0` = port aléatoire, utile pour les tests). |
| `HOST` | `127.0.0.1` | Interface d’écoute. Mettre `0.0.0.0` derrière un proxy. |
| `AGENDA_DATA_DIR` | `data` | Dossier du fichier `events.json`. |
| `AGENDA_SEED` | `demo` | `demo` crée quelques évènements fictifs au premier lancement ; `empty` démarre vide. Les dates de démo sont relatives au premier lancement. |
| `AGENDA_ADMIN_TOKEN` | généré | Jeton de modération. Définissez-le pour qu’il reste stable entre les redémarrages. |
| `AGENDA_ADMIN_RATE_LIMIT` | `10` | Nombre d’échecs de jeton (admin ou édition) avant blocage temporaire de l’IP. |
| `AGENDA_TZ` | `Europe/Paris` | Fuseau utilisé pour convertir les heures dans les `.ics`. |
| `AGENDA_PUBLIC_URL` | déduite de la requête | URL publique utilisée dans le flux et les liens de partage. En HTTPS, active aussi HSTS. |
| `AGENDA_EMBED_ORIGINS` | `*` | Origines autorisées à afficher l’iframe (`https://crm.exemple.fr https://site.exemple.fr`). |
| `AGENDA_CORS_ORIGIN` | `*` | Origine autorisée à appeler l’API JSON (une seule origine, ou `*`). |
| `AGENDA_TRUST_PROXY` | `0` | `1` uniquement derrière un proxy de confiance : utilise `X-Forwarded-For` pour les limites de débit. |
| `AGENDA_RATE_LIMIT` | `8` | Nombre de propositions autorisées par fenêtre et par IP. |
| `AGENDA_RATE_WINDOW_MS` | `600000` | Durée de la fenêtre de limitation (10 minutes). |

Exemple :

```bash
AGENDA_ADMIN_TOKEN="un-jeton-long-et-aléatoire" \
AGENDA_SEED=empty \
AGENDA_PUBLIC_URL="https://agenda.oreegami.example" \
AGENDA_EMBED_ORIGINS="https://crm.oreegami.example" \
HOST=0.0.0.0 \
npm start
```

> **En production** : mettez l’application derrière HTTPS, définissez un
> `AGENDA_ADMIN_TOKEN` long, utilisez `AGENDA_SEED=empty` et sauvegardez
> `data/events.json`.

---

## Sécurité

L’agenda est **public par conception** : n’importe qui peut consulter les évènements et en
proposer. La modération (modifier/supprimer) est protégée par un jeton.

- **Jeton de modération** : transmis uniquement par l’en-tête `X-Admin-Token`, jamais dans
  l’URL. S’il n’est pas configuré, un jeton aléatoire de 144 bits est généré au démarrage.
  Définissez `AGENDA_ADMIN_TOKEN` avec une valeur longue en production.
- **Jeton d’édition par évènement** : 192 bits, renvoyé une seule fois à la création,
  conservé dans le `localStorage` du navigateur créateur. Seul son hash SHA-256 est stocké
  côté serveur ; il n’est jamais exposé par l’API et ne permet de modifier que cet
  évènement.
- **Anti-spam** : champ piège + limite de 8 propositions par IP et par fenêtre de 10 minutes.
  Les échecs de jeton (admin ou édition) sont limités à 10 par IP et par fenêtre.
- **Validation stricte** : longueurs maximales, catégories fermées, dates cohérentes, corps
  JSON limité à 64 Ko, `Content-Type: application/json` exigé pour les écritures.
- **Liens externes** : seuls les URLs `http://` et `https://` sont acceptées ; les caractères
  de contrôle sont refusés, ce qui empêche l’injection de propriétés dans les fichiers
  `.ics`.
- **En-têtes** : CSP (`object-src 'none'`, `frame-ancestors` configurable), `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. HSTS est ajouté
  automatiquement quand `AGENDA_PUBLIC_URL` commence par `https://`.
- **Délais serveur** : `requestTimeout`, `headersTimeout` et `keepAliveTimeout` sont bornés
  pour limiter les connexions lentes.
- **Iframe / CRM** : en production, restreignez `AGENDA_EMBED_ORIGINS` au domaine du CRM.
  Par défaut (`*`), n’importe quel site peut afficher la page `/embed`.
- **Proxy** : laissez `AGENDA_TRUST_PROXY=0` si le serveur est exposé directement. Passez à
  `1` uniquement derrière un proxy de confiance qui écrase `X-Forwarded-For`.
- **Données** : `data/events.json` ne contient pas de secrets ; sauvegardez-le et
  vérifiez ses permissions. Ne versionnez jamais un fichier `.env`.

Limite connue : il n’y a pas de CAPTCHA. Pour une exposition à très grande échelle, ajoutez
un WAF/CAPTCHA devant le formulaire ou un jeton d’invitation.

---

## API

Toutes les réponses sont en JSON sauf les `.ics`.

| Méthode | Route | Accès | Description |
| --- | --- | --- | --- |
| `GET` | `/api/config` | public | Nom, fuseau, catégories, URL du flux et de l’embed. |
| `GET` | `/api/events` | public | Liste triée. Filtres : `upcoming=1`, `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `category=Atelier`, `limit=20`. |
| `POST` | `/api/events` | public | Crée un évènement et renvoie un `editToken` (une seule fois). |
| `GET` | `/api/events/:id` | public | Détail d’un évènement. |
| `PATCH` | `/api/events/:id` | créateur ou modération | Met à jour partiellement un évènement. |
| `DELETE` | `/api/events/:id` | créateur ou modération | Supprime un évènement. |
| `POST` | `/api/admin/check` | modération | Vérifie le jeton. |
| `GET` | `/events.ics` | public | Flux iCalendar complet (`?upcoming=1` pour le futur). |
| `GET` | `/events/:id.ics` | public | Fichier iCalendar d’un évènement. |
| `GET` | `/healthz` | public | Sonde de santé. |

### Créer un évènement

```bash
curl -X POST http://127.0.0.1:4500/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Atelier RAG",
    "start": "2026-12-01T18:00",
    "end": "2026-12-01T20:00",
    "location": "Oreegami — Campus Port Marianne",
    "category": "Atelier",
    "description": "Découpage, embeddings, recherche et génération.",
    "organizer": "Étudiants Oreegami",
    "url": "https://exemple.fr/inscription"
  }'
```

Champs : `title` (obligatoire), `start` (obligatoire, `YYYY-MM-DDTHH:mm`), `end`
(optionnel, +1 h par défaut), `allDay`, `location`, `category`, `description`,
`organizer`, `url`. Les dates sont en heure locale de Montpellier.

La réponse contient aussi `editToken` : conservez-le pour modifier l’évènement depuis le
même client. Il n’est jamais renvoyé par les autres routes.

### Modifier / supprimer

Avec le jeton d’édition renvoyé à la création :

```bash
curl -X PATCH http://127.0.0.1:4500/api/events/evt_xxx \
  -H "Content-Type: application/json" \
  -H "X-Edit-Token: $EDIT_TOKEN" \
  -d '{"title": "Nouveau titre"}'

curl -X DELETE http://127.0.0.1:4500/api/events/evt_xxx \
  -H "X-Edit-Token: $EDIT_TOKEN"
```

Ou avec le jeton de modération global :

```bash
curl -X PATCH http://127.0.0.1:4500/api/events/evt_xxx \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $AGENDA_ADMIN_TOKEN" \
  -d '{"title": "Nouveau titre"}'

curl -X DELETE http://127.0.0.1:4500/api/events/evt_xxx \
  -H "X-Admin-Token: $AGENDA_ADMIN_TOKEN"
```

---

## Données

`data/events.json` :

```json
{
  "version": 1,
  "events": [
    {
      "id": "evt_...",
      "title": "Atelier prompt engineering",
      "description": "…",
      "location": "Oreegami — Campus Port Marianne",
      "category": "Atelier",
      "start": "2026-12-01T18:00",
      "end": "2026-12-01T20:00",
      "allDay": false,
      "organizer": "Oreegami Montpellier",
      "url": "",
      "source": "web",
      "editTokenHash": "sha256…",
      "createdAt": 1763300000000,
      "updatedAt": 1763300000000
    }
  ]
}
```

`editTokenHash` est interne au serveur : il n’est jamais renvoyé par l’API. Les évènements
créés avant l’ajout de cette fonctionnalité n’ont pas de hash et restent modifiables
uniquement par la modération.

Écriture atomique (`events.json.tmp` puis renommage). Le fichier est créé au premier
lancement. Sauvegardez-le ou versionnez-le pour conserver l’agenda.

---

## Tests

```bash
npm test          # iCalendar + API
npm run test:ui   # parcours complet dans Chrome headless
```

- `test-ics.mjs` vérifie l’échappement, le repli des lignes, les journées entières et le
  passage heure de Paris → UTC (été/hiver).
- `test-api.mjs` démarre un serveur isolé (port aléatoire, dossier temporaire) et teste
  création, filtres, `.ics`, édition par le créateur, refus d’un jeton d’un autre
  évènement, modération, honeypot et suppression.
- `ui-test.mjs` ouvre la page dans Chrome, crée un évènement via le formulaire, le modifie
  avec le jeton d’édition du créateur, déverrouille la modération, modifie l’évènement et
  vérifie la page `/embed`. Définissez `CHROME_PATH` si Chrome n’est pas à l’emplacement
  par défaut.

---

## Structure

```
.
├── server.js            # serveur HTTP, API, pages, .ics
├── lib/
│   ├── store.js         # chargement, validation, écriture JSON
│   ├── ics.js           # génération iCalendar (RFC 5545)
│   ├── time.js          # dates locales, fuseau, conversion UTC
│   └── seed.js          # évènements de démonstration
├── public/
│   ├── index.html       # page complète
│   ├── embed.html       # page iframe pour le CRM
│   ├── app.js           # front commun (vanilla ES modules)
│   ├── styles.css
│   ├── favicon.png
│   └── oreegami-logo.svg
├── scripts/
│   ├── test-ics.mjs
│   ├── test-api.mjs
│   └── ui-test.mjs
├── data/                # créé au premier lancement (ignoré par git)
└── README.md
```
