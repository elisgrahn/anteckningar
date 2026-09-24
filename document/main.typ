#let com = ", "
#let un(c) = underline(c)

= TSKS15

=== Rep:

$
cases(
  H_0": " y = w,
  H_1": " y = 1 + w
)
", "
w ~ N(0, sigma^2)
\
stretch(->)^("vectors")
cases(
  H_0": " underline(y) = underline(a) + underline(w),
  H_1": " underline(y) = underline(b) + underline(w)
)
", "
a = vec(a[1], a[2], dots.v, a[n])

$




#pagebreak()

= TSRT92

== Fö1

#place(dx: 335.5pt, dy: -13.1pt, image("figures/f-50.svg"))

=== Example: A tank system

#underline("Balance equations:")

- Mass-balance
- Constant density for liquid

$=>$ Volume balance

Volume of liquid in tank: 
$A * h(t)$ [$"m"^3$]

Change (derivative, volume(time)): $d/(d t) A h (t) = u(t) - q(t)$ (1)

Bernoulli's law for outflow speed v [m/s]:

$v(t) = sqrt(2 g h(t)) => q(t) = a v(t) = a sqrt(2 g h(t))$ (2)

Result: $(d h(t)) / (d t) = - (a sqrt(2 g)) / A + 1/A u(t)$

This model can be used to get h(t) (and q(t) via (2)) if $u(t)$ and an initial value $h(t_0)$ are known.


\
=== Example: Hare-Lynx cycles

Populations: $N_1 = "#lynxes"$, $N_2 = "#hares"$

Birthrate: $lambda_i$ ($lambda_i N_i$ offspring per timeunit)

Mortality: 
- $mu_1 = gamma_1 - alpha_1 N_2$ (more hares $=>$ more lynxes)
- $mu_2 = gamma_2 - alpha_2 N_1$ (more lynxes $=>$ less hares)

#underline[Model:]

$d/(d t) N_1(t) = overbrace((lambda_1 - gamma_1), "typically < 0") N_1(t) + alpha_1 N_1(t) N_2(t)$

$d/(d t) N_2(t) = underbrace((lambda_2 - gamma_2), "typically > 0") N_2(t) + alpha_2 N_1(t) N_2(t)$










#pagebreak()

= Föreläsning 1

CBR är smidigt för att blablabla

#place(dx: 157.0pt, dy: 11.3pt, image("figures/f-27.svg"))

#place(dx: -10.5pt, dy: 0.3pt, image("figures/f-41.svg"))
== Exempel:

Om vi har kurvan  

#place(dx: -12.5pt, dy: -13.4pt, image("figures/f-37.svg"))

#place(dx: 30.0pt, dy: 19.1pt, image("figures/f-32.svg"))
$y = k x + m$

#place(dx: 80.0pt, dy: -0.1pt, image("figures/f-31.svg"))
så får vi figuren till höger.

#place(dx: -10.5pt, dy: -26.6pt, image("figures/f-35.svg"))

#place(dx: -4.0pt, dy: -12.6pt, image("figures/f-44.svg"))
\
\
\

#place(dx: 40.6pt, dy: -57.5pt, image("figures/f-45.svg"))

#place(dx: -10.0pt, dy: -1.6pt, image("figures/f-43.svg"))
Detta är ju faktiskt ganska smidigt

#place(dx: -10.1pt, dy: -9.1pt, image("figures/f-34.svg"))


#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))

\
\

$
L(y) = exp(-1/(2sigma^2) (1 - 2y)) " "_>^<" " Pr(H_0)/Pr(H_1)
$

#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
\
\
\
\
\
#place(dx: 67.5pt, dy: 61.2pt, image("figures/f-38.svg"))
