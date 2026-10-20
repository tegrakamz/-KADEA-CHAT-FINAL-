# Kadea Chat

Messagerie web pour la communauté Kadea Academy, réalisée avec **AdonisJS 7, Edge et PostgreSQL**.

**Site public : à renseigner après déploiement.**

## Fonctionnalités

- Inscription, confirmation d'adresse par e-mail, connexion et déconnexion.
- Renvoi du lien de confirmation et réinitialisation du mot de passe avec jeton expirant à usage unique.
- Modification du nom, de la photo et du mot de passe ; révocation des anciennes sessions après changement de mot de passe.
- Recherche d'utilisateurs, conversations privées, liste triée avec dernier message et historique paginé.
- Envoi et réception sans rechargement par flux SSE, reconnexion automatique et messages conservés dans PostgreSQL.
- Suppression de ses propres messages avec indication dans l'historique.
- Groupes, liste des membres et ajout/retrait par l'administrateur.
- Plusieurs administrateurs, promotions confirmées et avis d’ajout/retrait/promotion persistants dans le fil.
- Historique des groupes limité à la dernière période d’appartenance, avec accès en lecture seule après retrait.
- Modification de ses messages pendant cinq minutes, suppression personnelle des messages reçus, émojis et stickers sous forme d’émojis agrandis.
- Profils des autres membres en lecture seule, mosaïques des groupes et changement rapide de photo de profil.
- Thème clair/sombre persistant, y compris les pages publiques et les fenêtres de confirmation.
- Trois fonctionnalités avancées : statuts envoyé/reçu/lu et non-lus ; recherche dans les messages accessibles ; blocage/déblocage des discussions privées.
- Interface responsive avec identité visuelle dorée et blanche, listes latérales sur ordinateur et navigation séparée sur téléphone.
- Contrôles d'appartenance, mots de passe hachés, validation des formulaires, CSRF et limitation des tentatives d'authentification/envoi d'e-mail.

Le blocage concerne les échanges privés ; il ne retire pas les participants des groupes communs. La présence en ligne, l'indicateur de saisie et le partage de documents ne sont pas implémentés. Les photos de profil sont validées (JPG/PNG/WebP, 2 Mo maximum).

## Installation locale

Prérequis : Node.js **24 ou plus**, npm et PostgreSQL.

Depuis le dépôt cloné :

```sh
cd capstone
npm ci
```

Copier `.env.example` vers `.env`, renseigner les paramètres PostgreSQL et créer la base `kadea_chat`. Générer la clé :

```sh
node ace generate:key
node ace migration:run
npm run dev
```

Ouvrir `http://localhost:3333`. Dans PowerShell, utiliser `npm.cmd` si l'exécution de `npm.ps1` est désactivée.

Avec `MAIL_DRIVER=log`, les e-mails sont écrits dans `tmp/mail/`. Ouvrir le lien contenu dans le fichier pour confirmer le compte ou réinitialiser le mot de passe. Ce mode sert uniquement au développement ; la production exige Resend.

Les comptes déjà présents avant l'ajout de la confirmation doivent demander un lien depuis `/verify-email`. Aucun compte préconfiguré n'est nécessaire pour la démonstration, conformément au texte du livrable. Les tests créent et suppriment leurs propres comptes ; aucun seeder ne contourne la confirmation des comptes de démonstration.

## Variables d'environnement

Les exemples ne contiennent aucune clé réelle.

| Variable | Utilité |
|---|---|
| `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, `TZ` | Environnement et serveur |
| `APP_KEY` | Clé privée d'encryption des sessions, stable en production |
| `APP_URL` | URL publique utilisée pour les liens e-mail |
| `SESSION_DRIVER` | `cookie` conseillé ; `database` nécessite une table de sessions |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` | Connexion PostgreSQL |
| `DB_SSL`, `DB_SSL_CA` | TLS PostgreSQL et autorité de certification optionnelle |
| `MAIL_DRIVER` | `log` en local, `resend` en production |
| `MAIL_FROM`, `RESEND_API_KEY` | Expéditeur vérifié et clé privée Resend |
| `MAIL_TEST_MODE`, `MAIL_TEST_RECIPIENT` | Transfert des confirmations vers une boîte de démonstration, interdit en production ; aucun transfert des réinitialisations |
| `UPLOADS_PATH` | Répertoire persistant des photos ; défaut local `storage/uploads` |

## Vérifications

```sh
npm run typecheck
npm run lint
npm run test:setup
npx playwright install chromium
npm test
npm run build
```

Après compilation, `npm run test:production` installe le livrable dans `tmp/production-smoke` avec uniquement les dépendances de production, puis vérifie les migrations, la santé du serveur, les pages publiques et leurs ressources. Il utilise la base de test et n'envoie aucun e-mail externe.

`test:setup` crée et migre une base séparée `kadea_chat_test` avec les identifiants PostgreSQL locaux ; le rôle doit pouvoir créer une base. Sinon, créer cette base manuellement, puis exécuter les migrations en environnement de test. Les tests refusent une base dont le nom ne se termine pas par `_test`.

Les tests HTTP couvrent confirmation, expiration et réutilisation des jetons, révocation des sessions, accès interdits, conservation, suppression, groupes, blocage et flux SSE dans les deux sens. Le test Chromium vérifie l'interface ordinateur/téléphone, la recherche d'utilisateurs, l'envoi sans navigation, la suppression et la création/gestion d'un groupe.

En cas d'erreur SWC sous Windows, vérifier que les dépendances natives correspondant à la machine sont installées (`npm ci`) et que le cache SWC est accessible au compte exécutant Node. Ne pas copier un `node_modules` provenant d'un autre système d'exploitation. Le déploiement Docker installe ses dépendances Linux dans l'image.

## Organisation

- `app/controllers` : traitement des requêtes et réponses.
- `app/services` : requêtes de messagerie et gestion des e-mails/jetons.
- `app/services/group_service.ts` : transactions de création, ajout, retrait et promotion dans les groupes ; contrôles d’administration revérifiés sous verrou.
- `app/validators` : validation des données.
- `app/middleware` : authentification, contrôle des identifiants et limitation de débit.
- `database/migrations` : structure de la base ; `database/schema.ts` est généré par Lucid.
- `resources/views` : pages et composants Edge.
- `resources/js/chat.js` : flux temps réel, envoi et mises à jour de l'interface.

Le flux SSE contrôle les changements en base toutes les deux secondes, envoie uniquement les snapshots modifiés et revérifie les droits pendant la connexion. L'historique charge 100 messages à la fois. Les heures sont affichées pour le fuseau `Africa/Lagos`.

## Déploiement et soutenance

Voir le [guide Docker et Resend](docs/DEPLOYMENT.md) et le [schéma de la base de données](docs/DATABASE.md).
Voir aussi la [configuration des e-mails de test](docs/EMAIL_TESTING.md) et la [checklist locale avant commit](docs/LOCAL_CHECKLIST.md).
L’[état de l’audit des dépendances](docs/SECURITY.md) précise l’alerte transitive encore sans correctif compatible.

Choix visuels : palette dorée/blanche propre au projet, hiérarchie lisible, bulles différenciées et interface à deux colonnes sur ordinateur. Sur téléphone, la discussion occupe l'écran et un bouton permet de revenir à la liste. Les erreurs, l'envoi et les interruptions de connexion ont des retours visibles.
