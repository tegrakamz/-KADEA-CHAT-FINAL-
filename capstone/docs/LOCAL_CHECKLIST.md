# Finalisation locale et préparation du commit

## Résultat du contrôle du 20 octobre 2026

- Sept tests fonctionnels et cinq tests navigateur validés sur la version finalisée (les suites ont été exécutées séparément après la dernière correction du test de session).
- TypeScript et ESLint validés ; compilation finale réussie.
- Contrôle du livrable compilé avec les seules dépendances de production réussi : migrations, santé, pages publiques, ressources, initialisation du thème et page 404.
- `git diff --check` réussi. `.env`, les fichiers compilés et les photos ne sont pas suivis ; les fichiers nouveaux restent à ajouter volontairement lors du commit.
- Aucun commit, push, déploiement ni envoi réel d’e-mail effectué.
- Docker absent de la machine : exécution du conteneur non vérifiée localement. Le workflow CI inclut sa construction ainsi que le contrôle du livrable compilé, mais son exécution distante n’a pas été vérifiée.
- Audit npm : alerte transitive sans correctif publié, détaillée dans `SECURITY.md`. Elle reste à surveiller ; ce contrôle ne prétend pas certifier l’absence de toute vulnérabilité.

## Installation sur une nouvelle machine

1. Installer Node.js 24+ et PostgreSQL. Depuis `capstone`, exécuter `npm ci`.
2. Copier `.env.example` vers `.env`, compléter la connexion PostgreSQL et créer la base.
3. Exécuter `node ace generate:key`, puis `node ace migration:run`.
4. Lancer `npm run dev` (`npm.cmd run dev` sous PowerShell si nécessaire).
5. Pour un parcours entièrement local, conserver `MAIL_DRIVER=log` et `MAIL_TEST_MODE=false` : les liens sont dans `tmp/mail`. Pour Resend, suivre `EMAIL_TESTING.md`. Ne jamais commiter `.env`.

## Vérifications avant livraison

```sh
npm run test:setup
npx playwright install chromium
npm run typecheck
npm run lint
npm test
npm run build
npm run test:production
```

Les tests utilisent une base `_test`, des comptes temporaires et des envois Resend simulés. Le dernier contrôle installe les seules dépendances de production dans `tmp/production-smoke`, migre la base de test et vérifie le serveur compilé, les pages publiques, les ressources et la page 404. Il n’envoie aucun e-mail. Il nécessite l’accès au registre npm si les paquets ne sont pas en cache.

## Parcours à montrer

- Créer et confirmer deux nouveaux comptes, dans deux sessions distinctes.
- Vérifier le refus de connexion avant confirmation et la réinitialisation du mot de passe.
- Envoyer dans les deux sens sans recharger, puis recharger pour vérifier la conservation.
- Vérifier les statuts, la recherche, le blocage, la suppression et la limite de modification.
- Créer un groupe, ajouter un membre après quelques messages et vérifier qu’il ne voit pas le passé.
- Retirer le membre, vérifier la lecture seule et l’avis en bas ; le réintégrer et vérifier la nouvelle période d’accès.
- Promouvoir un second administrateur et vérifier qu’un membre ordinaire ne peut pas le faire.
- Montrer l’affichage mobile, les confirmations, les profils et les deux thèmes.

## Commit à réaliser par le propriétaire

Depuis la racine du dépôt :

```sh
git status --short
git diff --check
git diff --stat
```

Examiner aussi les fichiers non suivis : `git diff` seul ne les montre pas. Ajouter les fichiers source, migrations, tests, documentation et workflow CI souhaités, puis examiner `git diff --cached` avant le commit. Ne pas ajouter `.env`, `node_modules`, `build`, `tmp`, les photos stockées ou les clés. Le travail local n’est pas publié tant que le commit n’a pas été poussé.

## Ce qui dépendra du déploiement

- Obtenir un domaine d’expédition vérifié pour envoyer à de vrais utilisateurs ; le transfert de démonstration ne prouve pas la possession de leur adresse.
- Configurer PostgreSQL, les secrets, le stockage persistant des photos et l’URL HTTPS sur l’hébergeur.
- Configurer `APP_URL` avec l’URL publique, `MAIL_DRIVER=resend`, `MAIL_TEST_MODE=false` et l’expéditeur vérifié.
- Vérifier réception réelle des confirmations/réinitialisations et SSE entre deux navigateurs sur le site public.
- Remplacer la mention « à renseigner » dans les deux README par la vraie URL.
- Suivre l’alerte transitive documentée dans `SECURITY.md` ; elle n’a pas de version corrigée publiée lors de la finalisation locale. Docker doit être installé pour exécuter les vérifications du conteneur sur cette machine ; le serveur compilé peut être vérifié sans Docker.

Aucun déploiement, commit, push ou envoi réel n’est déclenché par cette checklist. Le texte de l’énoncé ne demande pas de comptes précréés ; les utilisateurs de démonstration doivent suivre le parcours de confirmation. Le barème mentionnant aussi des seeders, confirmer cette contradiction avec l’enseignant plutôt que contourner la vérification des comptes.
