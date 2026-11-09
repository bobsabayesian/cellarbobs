# Online Wine Data

CellarBoss can look a vintage up online and show what it finds on the vintage page: critic scores, short review summaries, the drinking window, grapes, alcohol, how the wine was made, tasting profile, serving and food pairings, and price.

The lookup asks a Google Gemini model, which searches the web for the wine. It's AI-gathered, so each lookup lists the pages it was based on, and a critic score links to the page it was published on when the model found one. Check those before relying on a score.

The server needs a Gemini API key (`GEMINI_API_KEY`) for this, and only an admin can run lookups.

## Looking wines up

- **One vintage:** on the vintage page, click **Look up online** in the **Online data** card. **Look up again** replaces the earlier result.
- **All of a wine's vintages:** on the wine page, click **Look up online**.
- **The whole cellar:** in [System Settings](/guide/settings), under **Online wine data**, click **Look up new vintages** for vintages never looked up, or **Refresh all** to look every vintage up again. The run carries on in the background, so you can leave the page; click **Stop** to end it after the current vintage.

A lookup takes up to a minute per vintage.

## Drinking windows

A lookup fills in a vintage's drinking window when the vintage has none. It never changes a window you set. Turn **Fill drinking windows from lookups** off in System Settings to choose for yourself: the vintage page then offers the window it found, with a **Use** button.

A vintage with no window can also take one from the wine's other vintages. If they open on average 5 years after the harvest and close after 20, a 2020 gets 2025–2040. The vintage page offers that estimate when there is one. **Fill empty windows from other vintages** in System Settings fills every empty window it can.

## Choosing the model

The **Online lookup model** setting picks the Gemini model. It's `gemini-flash-latest` by default, which is cheap and quick. A Pro model, such as `gemini-pro-latest`, is more accurate and costs more.
