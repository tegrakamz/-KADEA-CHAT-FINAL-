# Déploiement avec Docker et Resend

## Ressources à préparer

1. Un hébergeur capable d'exécuter un conteneur Node.js avec des connexions HTTP longues, une URL HTTPS et un volume persistant.
2. Une base PostgreSQL et ses paramètres de connexion.
3. Un compte Resend, un domaine d'expédition vérifié et une clé d'API. Suivre la [documentation officielle d'envoi](https://resend.com/docs/api-reference/emails/send-email).

Le projet n'est pas publié automatiquement. Aucun abonnement ni compte externe n'est créé par ces fichiers.

### Recevoir un premier e-mail sans domaine personnel

Créer un compte sur Resend, générer une clé API autorisée à envoyer des e-mails, puis renseigner uniquement dans `.env` :

```dotenv
MAIL_DRIVER=resend
RESEND_API_KEY=la-cle-privee-de-votre-compte
MAIL_FROM=Kadea Chat <onboarding@resend.dev>
```

Redémarrer le serveur et demander un nouveau lien de confirmation. Avec cet expéditeur de test, le destinataire doit être **l'adresse associée au compte Resend**. L'expéditeur `resend.dev` ne permet pas l'envoi à tous les utilisateurs : voir les [restrictions officielles](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Pour les comptes de la démonstration et le site public, vérifier un domaine dans Resend, puis remplacer `MAIL_FROM` par une adresse de ce domaine. Le mode `MAIL_DRIVER=log` enregistre seulement des fichiers dans `tmp/mail`, même si l'application est accessible depuis un navigateur.

## Configuration

Copier `.env.production.example` vers `.env.production` en local, ou renseigner les mêmes variables dans l'interface sécurisée de l'hébergeur. Ce fichier est ignoré par Git et Docker.

- Générer une nouvelle `APP_KEY`, par exemple avec `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Conserver cette clé entre les redémarrages et les déploiements.
- Mettre l'URL HTTPS réelle dans `APP_URL`, sans chemin supplémentaire. Les liens e-mail utilisent cette URL.
- Renseigner `MAIL_DRIVER=resend`, `RESEND_API_KEY` et `MAIL_FROM` avec une adresse appartenant au domaine vérifié.
- Renseigner `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`. Créer la base avant le premier démarrage.
- Activer `DB_SSL=true` si la connexion de la base l'exige. La vérification du certificat reste active. Renseigner `DB_SSL_CA` si le fournisseur utilise sa propre autorité.
- Monter un volume durable dans `/data/uploads`, accessible en écriture à l'utilisateur `node` du conteneur (UID 1000). Sauvegarder ce volume et PostgreSQL.
- Garder `SESSION_DRIVER=cookie`. L'option `database` nécessite de créer la table de sessions Adonis avant de l'utiliser.

Le démarrage en production refuse les URL HTTP ou une configuration e-mail manquante.

## Construire et lancer

Depuis `capstone/` :

```sh
docker build -t kadea-chat .
docker run --env-file .env.production -p 127.0.0.1:3333:3333 -v kadea_uploads:/data/uploads kadea-chat
```

Ou, sur un serveur avec Docker Compose :

```sh
docker compose up -d --build
docker compose logs -f app
```

Le conteneur applique les migrations, puis lance le serveur. Une migration en échec empêche son démarrage. Sauvegarder la base avant les évolutions futures ; ne jamais lancer de commande de remise à zéro en production.

Sur une plateforme qui gère elle-même HTTPS, exposer le port `3333` du conteneur et configurer son contrôle de santé sur `/health`. Le port peut être remplacé par la variable `PORT`.

## HTTPS et flux temps réel

Les messages passent par des Server-Sent Events (`GET /events`) ; l'envoi utilise des requêtes HTTP protégées par CSRF. Le serveur examine PostgreSQL toutes les deux secondes et transmet les changements sans rechargement. Cela fonctionne aussi entre plusieurs instances partageant la même base. Le coût des requêtes augmente avec le nombre d'onglets ; cette version vise un usage de petite communauté, pas une charge massive.

Le proxy doit conserver les connexions SSE, désactiver leur mise en tampon et autoriser leur reconnexion. Exemple Nginx à intégrer dans un serveur HTTPS déjà configuré :

```nginx
location / {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
location /events {
    proxy_pass http://127.0.0.1:3333;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1800s;
}
```

Les cookies de session sont sécurisés en production et nécessitent un accès HTTPS dans le navigateur. Les liens de réinitialisation sont à usage unique. Modifier ou réinitialiser le mot de passe invalide les autres sessions à leur prochaine requête et ferme leurs flux.

## Vérification avant remise

1. `/health` répond 200 et les pages ne montrent aucune erreur serveur.
2. Créer deux nouveaux comptes sur l'URL publique. Vérifier la réception des e-mails dans deux boîtes réelles et confirmer les adresses.
3. Vérifier le refus de connexion d'un compte non confirmé.
4. Échanger dans les deux sens depuis deux navigateurs sans actualisation ; recharger et vérifier la conservation.
5. Créer un groupe avec au moins trois comptes. Vérifier le refus d’accès d’un compte extérieur. Un membre ajouté ne voit que les messages à partir de son ajout, y compris dans la recherche et les aperçus. Après retrait, le groupe reste visible, l’avis nomme l’administrateur en bas de la conversation, l’historique s’arrête au retrait, les membres/profils restent consultables et tout nouvel envoi est refusé. Réintégrer le membre : vérifier la reprise des échanges et l’absence des messages antérieurs au nouvel ajout. La date `conversation_members.created_at` représente le début de la dernière période d’accès ; ajouter un membre déjà actif ne modifie pas cette date.
6. Vérifier suppression, statuts/non-lus, recherche et blocage/déblocage.
7. Tester le mot de passe oublié avec un vrai e-mail et la modification du profil/photo.
8. Tester sur téléphone, puis redémarrer le service et vérifier la conservation des données et des photos.
9. Ajouter l'URL publique dans le README et remettre le lien du dépôt GitHub.

## Maintenance et dépendances

L'audit npm du 20 octobre 2026 signale une vulnérabilité transitive de `braces` liée aux motifs d'accolades profondément imbriqués, répercutée sur plusieurs paquets Adonis. L'[avis GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) ne propose pas de version corrigée au moment de la vérification. Le projet n'expose pas de saisie de motifs glob aux utilisateurs. Cette analyse réduit le périmètre apparent d'exposition, sans constituer une garantie d'absence d'exploitabilité dans toutes les dépendances.

Ne pas appliquer `npm audit fix --force` : la proposition observée rétrograde Adonis vers une version incompatible avec l'énoncé. Surveiller les correctifs upstream, conserver le verrouillage des dépendances et réexécuter les tests après toute mise à jour.

Nettoyer périodiquement les entrées expirées de `account_tokens` et `rate_limits`. Surveiller les erreurs serveur et d'envoi d'e-mail. Les e-mails locaux de `tmp/mail` contiennent des liens sensibles et restent exclus de Git.
