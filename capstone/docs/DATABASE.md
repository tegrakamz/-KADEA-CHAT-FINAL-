# Base de données — Kadea Chat

```mermaid
erDiagram
  users ||--o{ conversations : cree
  users ||--o{ conversation_members : participe
  conversations ||--o{ conversation_members : contient
  conversations ||--o{ messages : contient
  users ||--o{ messages : envoie
  users ||--o{ message_hides : masque
  messages ||--o{ message_hides : est_masque
  users ||--o{ account_tokens : possede
  users ||--o{ user_blocks : bloque
  users ||--o{ user_blocks : est_bloque
  users {
    int id PK
    string full_name
    string email UK
    string password "hachage scrypt"
    timestamp email_verified_at
    string avatar "nom aleatoire du fichier"
    timestamp created_at
    timestamp updated_at
  }
  conversations {
    int id PK
    string name "null pour une discussion privee"
    string type "private ou group"
    int created_by FK
    timestamp created_at
    timestamp updated_at
  }
  conversation_members {
    int id PK
    int conversation_id FK
    int user_id FK
    boolean is_admin
    timestamp last_read_at
    timestamp last_delivered_at
    timestamp created_at
    timestamp removed_at "fin de la periode d'acces"
    int removed_by FK "administrateur ayant retire le membre"
    string removed_by_name "nom conserve au moment du retrait"
    int added_by FK "administrateur ayant ajoute le membre"
    string added_by_name
  }
  messages {
    int id PK
    int conversation_id FK
    int user_id FK
    text body
    timestamp created_at
    timestamp deleted_at
    timestamp edited_at
    string event_kind "added, removed, promoted ou null"
    string event_actor_name
    string event_target_name
  }
  message_hides {
    int message_id PK,FK
    int user_id PK,FK
  }
  account_tokens {
    int id PK
    int user_id FK
    string token_hash UK "SHA-256, jamais le jeton brut"
    string purpose "verify ou reset"
    timestamp expires_at
  }
  user_blocks {
    int user_id PK,FK
    int blocked_user_id PK,FK
  }
  rate_limits {
    string key PK "SHA-256 de IP et chemin"
    int attempts
    timestamp expires_at
  }
```

- La paire `(conversation_id, user_id)` est unique.
- Dans un groupe, `conversation_members.created_at` marque le dernier ajout. Un membre ne voit que les messages compris entre cette date et son éventuel `removed_at`. Une réintégration ouvre une nouvelle période ; les aperçus, recherches, compteurs et flux SSE appliquent les mêmes limites. Les conversations privées conservent leur historique normal.
- Un membre retiré conserve cette période d’historique en lecture seule et peut consulter les membres actuels. C’est un choix produit explicite ; un utilisateur extérieur n’ayant jamais été membre n’a aucun accès au groupe.
- Plusieurs administrateurs sont possibles. Seul un administrateur actif peut ajouter, retirer ou promouvoir un membre actif. Les administrateurs ne sont pas retirables par la fonction de retrait actuelle ; aucune rétrogradation n’est exposée.
- Les avis système d’ajout, retrait et promotion sont des lignes de `messages` avec `event_kind`. Ils sont créés dans la même transaction que l’action et ne peuvent pas être modifiés ou supprimés par les utilisateurs.
- `message_hides` masque un message reçu uniquement pour l’utilisateur concerné. La suppression d’un message envoyé reste globale. Les modifications de messages personnels sont limitées aux cinq minutes suivant l’envoi, avec contrôle serveur.
- Les clés étrangères préservent l'intégrité ; la suppression d'un utilisateur ou d'une conversation entraîne les suppressions liées prévues par les migrations.
- La création simultanée d'une même discussion privée est sérialisée par un verrou transactionnel PostgreSQL sur la paire d'utilisateurs.
- La suppression d'un message vide son contenu et renseigne `deleted_at`. L'historique conserve une indication de suppression.
- Les jetons de confirmation durent 24 h ; ceux de réinitialisation, 1 h. Après utilisation, les jetons de la même finalité sont supprimés.
- `last_delivered_at` signifie que le flux du destinataire a pris en charge les messages de la discussion. `last_read_at` est mis à jour lorsque la discussion est ouverte dans un onglet actif. En groupe, « Lu » signifie lu par tous les autres membres actuels.
- Les comptes existants avant la migration doivent confirmer leur adresse avec le formulaire « Confirmer mon adresse ».
