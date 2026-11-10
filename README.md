# Script Webflow de L’Affiche

`script.js` est la source. `script.min.js` est la version publiée utilisée par Webflow.
Les deux fichiers doivent être mis à jour ensemble : le fichier minifié est conservé
dans le dépôt pour éviter de dépendre du cache de minification automatique du CDN.

Pour régénérer la version minifiée :

```sh
npx --yes --package terser@5.44.0 terser script.js --compress --mangle --output script.min.js
```

Après publication, purger les deux URL jsDelivr et vérifier que `script.min.js`
contient bien la modification avant de confirmer sa disponibilité sur le site.

La migration des cartes vers une page dédiée `/chatbot-cartes` est décrite dans
[WEBFLOW.md](WEBFLOW.md). Elle nécessite de supprimer le catalogue caché du
composant partagé dans Webflow : publier le JavaScript seul ne retire pas le HTML.
L'attribut `data-ai-search-catalog-url="/chatbot-cartes"` sélectionne la source
dédiée. Les cartes sont préparées dès l'envoi de la question, avec deux requêtes
maximum à la fois, puis mises en cache sous forme de texte. Les explications
n'attendent pas leur chargement. Aucun catalogue n'est chargé au repos ou au scroll.

Tests du chargement à la demande (Playwright et Chrome requis) :

```sh
node --test tests/lazy-cards.test.cjs
```

La photo des fondateurs utilise l’URL fixe définie dans `foundersImageUrl`.
Elle s’affiche après le texte de la première réponse sur les fondateurs, Suzanne,
Martin ou l’origine du projet. L’indicateur reste actif tant que la conversation
existe, y compris après fermeture du panneau ou troncature de son historique.

Une demande sur un spectacle précis utilise `criteria.conversation_mode="detail"`
et `detail_target.webflow_id`. Elle affiche uniquement la carte de ce spectacle,
avec son affiche, sans flèches, pagination, liste de raisons ni conclusion de
sélection. Le texte détaillé conserve ses paragraphes (jusqu’à 6 000 caractères).
En cas de résultats ambigus sans cible, aucune carte n’est choisie arbitrairement.
Les demandes explicites de spectacles similaires conservent le parcours de sélection.

La fiche détaillée construit sa carte avec `image_url`, `title`, `slug`,
`venue.name` et `category` renvoyés par n8n, sans attendre la pagination du
catalogue. Le premier titre cité dans la présentation est lié à sa fiche.
Un problème de cartes ne produit pas de message de suggestions en mode détail.
Le tarif transmis par le workflow est conservé.

Publication du 11 novembre 2026 : Webflow charge la version figée
`https://cdn.jsdelivr.net/gh/nicolastizio-co/laffiche-chatbot-cdn@d941f95/script.min.js`.
Le chemin `@main/script.min.js` restait ancien après une purge réussie.
Pour une prochaine mise à jour, modifier aussi cette référence dans le Footer Code
Webflow et publier les domaines ; pousser sur `main` seul ne met plus à jour le site.
