# Simulateur d'épargne Québec 2026
## Groupe Financier Formule — Portefeuille proposé par Olivier Fraser

---

## 🚀 Structure du projet

```
gff-simulateur/
├── index.html                          ← Le simulateur (fichier principal)
├── netlify.toml                        ← Configuration Netlify
├── netlify/
│   └── functions/
│       └── rappel-mise-a-jour.mjs     ← Fonction de rappel automatique
└── README.md
```

---

## ⚙️ Configuration initiale (à faire une seule fois)

### 1. Variables d'environnement dans Netlify

Dans **app.netlify.com → Ton site → Site configuration → Environment variables**, ajouter :

| Variable | Valeur | Description |
|---|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxxxxxx` | Clé API Resend (voir ci-dessous) |
| `EMAIL_DESTINATAIRE` | `olivier@groupefinancierformule.com` | Ton courriel professionnel |
| `EMAIL_EXPEDITEUR` | `GFF Simulateur <noreply@groupefinancierformule.com>` | Expéditeur (doit être ton domaine vérifié) |

### 2. Créer un compte Resend (gratuit)

1. Aller sur **resend.com** → créer un compte gratuit
2. Ajouter et vérifier ton domaine (ex: `groupefinancierformule.com`)
3. Créer une clé API dans **API Keys**
4. Copier la clé dans la variable `RESEND_API_KEY` de Netlify

### 3. Déployer depuis GitHub

1. Créer un dépôt GitHub : **github.com → New repository → `gff-simulateur`**
2. Glisser tous les fichiers dans le dépôt
3. Dans Netlify : **Add new site → Import an existing project → GitHub**
4. Sélectionner le dépôt `gff-simulateur`
5. Build settings : tout laisser vide (site statique)
6. Cliquer **Deploy**

---

## 📧 Rappels automatiques

La fonction tourne automatiquement le **1er de chaque mois** et envoie un courriel si :

| Mois | Rappel |
|---|---|
| **Novembre** | ⚠️ Mettre à jour les plafonds ARC (REER/CELI/PSV) pour l'année suivante |
| **Février** | ⚠️ Vérifier les nouveaux taux marginaux CQFF |
| **Tous les mois** | 📊 Si les portefeuilles n'ont pas été mis à jour depuis 45+ jours |

---

## 🔄 Mise à jour du simulateur

### Mettre à jour les portefeuilles (mensuel)
1. Télécharger les nouvelles fiches PDF de tes 5 portefeuilles
2. Ouvrir Claude → partager les PDFs → demander la mise à jour
3. Télécharger le nouveau `index.html`
4. Glisser dans le dépôt GitHub → Netlify redéploie automatiquement

### Mettre à jour les données fiscales (janvier)
1. Ouvrir Claude
2. Partager les nouveaux plafonds ARC et taux CQFF
3. Claude met à jour l'objet `FISCAL` dans le simulateur
4. Même procédure que ci-dessus

### Mettre à jour la date des portefeuilles dans la fonction
Dans `netlify/functions/rappel-mise-a-jour.mjs`, ligne 17 :
```js
const PORTEFEUILLES_MAJ = "2026-04-30"; // ← Changer cette date
```

---

## 🛠️ Tester la fonction manuellement

Dans le terminal Netlify CLI :
```bash
netlify functions:invoke rappel-mise-a-jour
```

Ou dans **app.netlify.com → Functions → rappel-mise-a-jour → Test function**

---

## 📞 Support

Pour toute modification du simulateur, contacter Claude sur **claude.ai**
et mentionner "simulateur GFF".
