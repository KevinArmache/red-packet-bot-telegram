package com.redpacketbot.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Red = Color(0xFFC62828)
val Green = Color(0xFF2E7D32)
val Orange = Color(0xFFEF6C00)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Red,
            secondary = Color(0xFFFFA000),
            background = Color(0xFFFFF8F6),
            surface = Color.White,
        ),
        content = content,
    )
}

@Composable
fun Section(title: String, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            content()
        }
    }
}

/** Ligne de liste : pastille (✅ / ⚠️ / ❔), titre, détail, action à droite. */
@Composable
fun CheckRow(ok: Boolean?, title: String, detail: String = "", action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            when (ok) {
                true -> "✅"
                false -> "⚠️"
                null -> "❔"
            },
            fontSize = 20.sp,
        )
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            if (detail.isNotEmpty()) Text(detail, fontSize = 13.sp, color = Color.DarkGray)
        }
        Spacer(Modifier.width(8.dp))
        action()
    }
}

@Composable
fun Hint(text: String, color: Color = Color.DarkGray) {
    Text(text, fontSize = 13.sp, color = color)
}
