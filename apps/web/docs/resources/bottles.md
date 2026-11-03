# Bottles

Bottles represent individual physical bottles in your cellar.

Before adding bottles, you must first create the associated [wine](/resources/wines) and [vintage](/resources/vintages).
Optionally, you can also create a [storage location](/resources/storages) to track where the bottle is located.

## List View

The bottles page shows your bottles in a searchable, filterable data table.

With the **Hide consumed bottles** [setting](/guide/settings) on (the default), drunk, sold and gifted bottles are left out. **Show consumed (N)** brings them back for that visit, and a status filter in the URL (e.g. `/bottles?status=drunk`) always shows exactly what it asks for. On a [vintage](/resources/vintages) page, past bottles fold into "Show N past bottles", newest first.

![Bottles list](/screenshots/bottles-list.png)

### Columns

| Column          | Description                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wine            | Shows the [wine](/resources/wines), [vintage](/resources/vintages) and [winemaker](/resources/winemakers)                                         |
| Drinking Window | Whether or not the [wine](/resources/wines) is within it's defined drinkable window (current date is after _drink from_ and before _drink until_) |
| Purchase Date   | When the bottle was purchased                                                                                                                     |
| Price           | The price paid for the bottle                                                                                                                     |
| Storage         | The current [storage](/resources/storages) location                                                                                               |
| Location        | The [location](/resources/locations) in which this bottle is stored                                                                               |
| Status          | Current status (stored, consumed, gifted, etc.)                                                                                                   |
| Actions         | Shortcut buttons for common actions. Hover over the icon to see what each button does                                                             |

### Filtering

Use the filter controls above the table to narrow results by status, wine type, or other attributes. See [DataTable Features](/features/datatable) for full details.

![Bottles filtered](/screenshots/bottles-filter.png)

## Consumed

**Consumed** in the sidebar is your drinking history: every bottle that's been drunk, sold or given away, newest first and grouped by month. Each bottle shows:

- the date it left the cellar, and the note recorded then (e.g. "w/Kristen", "Brought by Dave · Blind tasting: …")
- a **Note: N/10** link when you wrote a tasting note for that vintage on the same day

At the top are counts for all time and this year. Search covers the wine, region, type and note, and tolerates typos. The status buttons (Drunk, Sold, Gifted) and the year menu narrow the list.

## Creating a Bottle

Click the **Create new Bottle** button to add a new bottle to your cellar.

![Create bottle](/screenshots/bottles-create.png)

### Fields

| Field          | Required | Description                                                                             |
| -------------- | -------- | --------------------------------------------------------------------------------------- |
| Vintage        | Yes      | Select the wine vintage this bottle belongs to                                          |
| Storage        | Yes      | Where the bottle is stored                                                              |
| Status         | Yes      | The current status of the bottle (_ordered_, _drunk_ etc)                               |
| Purchase Date  | No       | When the bottle was purchased                                                           |
| Purchase Price | No       | Price paid for the bottle                                                               |
| Quantity       | Yes      | Create _n_ identical bottles with these details. Useful when an entire case is ordered! |

## Viewing a Bottle

Click the **View** button to view the bottle's full details.

![Bottle detail](/screenshots/bottles-detail.png)

## Editing a Bottle

Click the **Edit** button to modify the bottle's information.

![Edit bottle](/screenshots/bottles-edit.png)

## Deleting a Bottle

Click the **Delete** button to remove the bottle. You will be asked to confirm before deletion.

::: warning
Deleting a bottle is permanent and cannot be undone.
:::
